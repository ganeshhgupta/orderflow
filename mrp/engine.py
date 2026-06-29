# mrp/engine.py
"""
SAP MRP Algorithm Implementation
Net Requirements -> Lot Sizing -> Lead Time Scheduling -> Exception Messages
"""
import json
import logging
import math
import uuid
from collections import defaultdict
from datetime import datetime, date, timedelta
from typing import Callable, List, Optional

logger = logging.getLogger("mrp.engine")

EXCEPTION_DESCRIPTIONS = {
    "01": "Opening date in past",
    "02": "Start date in past — forward scheduled",
    "07": "Finish date after requirement date",
    "10": "Reschedule In — pull order earlier",
    "15": "Reschedule Out — push order later",
    "20": "Cancel — no matching requirement",
    "25": "New order required",
    "30": "Increase order quantity",
    "35": "Reduce order quantity",
    "50": "Stock below safety stock",
}


def _today() -> date:
    return datetime.utcnow().date()


def calculate_eoq(
    annual_demand: float,
    ordering_cost: float,
    unit_price: float,
    holding_rate: float = 0.25,
) -> float:
    """EOQ = sqrt(2 * D * S / H)  where H = unit_price * holding_rate"""
    if annual_demand <= 0 or ordering_cost <= 0 or unit_price <= 0:
        return 1.0
    h = unit_price * holding_rate
    return math.sqrt(2.0 * annual_demand * ordering_cost / h)


def apply_lot_sizing(net_req: float, material) -> float:
    """Apply lot sizing procedure to a net requirement."""
    key = material.lot_sizing_key.value if hasattr(material.lot_sizing_key, "value") else material.lot_sizing_key

    if key == "EX":
        qty = net_req
    elif key == "FX":
        fls = material.fixed_lot_size or 1.0
        qty = math.ceil(net_req / fls) * fls
    elif key == "HB":
        max_lvl = material.max_stock_level or (net_req * 2)
        qty = max(net_req, max_lvl - (material._current_stock or 0))
    elif key == "EQ":
        annual = material.annual_demand_est or (net_req * 12)
        eoq = calculate_eoq(annual, material.ordering_cost or 50.0, material.unit_price or 1.0)
        qty = max(net_req, round(eoq, 2))
    else:
        qty = net_req

    # Apply min/max/rounding constraints
    min_q = material.min_order_qty or 1.0
    if qty < min_q:
        qty = min_q

    if material.max_order_qty and qty > material.max_order_qty:
        qty = material.max_order_qty

    rv = material.rounding_value
    if rv and rv > 0:
        qty = math.ceil(qty / rv) * rv

    return max(1.0, qty)


def schedule_planned_order(req_date: date, lead_time_days: int, today: date):
    """
    Backward scheduling: start = req_date - lead_time.
    Falls back to forward scheduling if start < today.
    Returns (start_date, finish_date, exception_codes).
    """
    exceptions = []
    gr_days = 1  # goods receipt processing time

    finish = req_date - timedelta(days=gr_days)
    start = finish - timedelta(days=max(0, lead_time_days - 1))

    if start < today:
        exceptions.append("02")  # start date in past
        start = today
        finish = today + timedelta(days=lead_time_days)
        if finish > req_date:
            exceptions.append("07")  # finish after requirement

    return start, finish, exceptions


def compute_low_level_codes(bom_items) -> dict:
    """
    Low-level code (LLC) = maximum depth at which a material appears in any BOM.
    Top-level finished goods get LLC=0. Direct components get LLC=1, etc.
    Uses iterative relaxation to handle multi-level BOMs correctly.
    """
    llc = {}
    for item in bom_items:
        if item.parent_material_id not in llc:
            llc[item.parent_material_id] = 0
        if item.component_material_id not in llc:
            llc[item.component_material_id] = 0

    changed = True
    while changed:
        changed = False
        for item in bom_items:
            candidate = llc.get(item.parent_material_id, 0) + 1
            if candidate > llc.get(item.component_material_id, 0):
                llc[item.component_material_id] = candidate
                changed = True

    return llc


def run_full_mrp(run_id: str, db, log: Callable) -> dict:
    """
    Full MRP run against all active materials.
    log(level, message, payload_dict, material_id=None)
    Returns summary dict.
    """
    from api.models import (
        Material, MaterialStock, Requirement, PlannedOrder,
        MRPRun, ExceptionMessage, MRPLogLevel, MRPType, BOMItem,
    )

    today = _today()
    log("INFO", f"MRP run {run_id[:8]} started", {"run_id": run_id, "today": str(today)})

    materials = db.query(Material).all()
    log("INFO", f"Scope: {len(materials)} materials in plant", {"count": len(materials)})

    # ── BOM setup ─────────────────────────────────────────────────────────────
    bom_items = db.query(BOMItem).filter(BOMItem.is_active == True).all()  # noqa: E712
    bom_by_parent = defaultdict(list)
    for bi in bom_items:
        bom_by_parent[bi.parent_material_id].append(bi)

    llc_map = compute_low_level_codes(bom_items)

    # Clear dependent requirements from prior runs so they don't accumulate
    cleared = db.query(Requirement).filter(Requirement.source == "BOM_EXPLOSION").delete()
    if cleared:
        log("INFO", f"Cleared {cleared} dependent requirements from previous run",
            {"cleared": cleared})
    db.flush()

    # Sort materials by LLC: parents (LLC=0) before their components (LLC≥1)
    materials = sorted(materials, key=lambda m: llc_map.get(m.id, 0))

    log("INFO",
        f"BOM: {len(bom_items)} items, {len(bom_by_parent)} parent materials, "
        f"LLC range 0–{max(llc_map.values(), default=0)}",
        {"bom_items": len(bom_items), "parents": len(bom_by_parent)})

    total_pos = 0
    total_ex = 0
    mats_planned = 0

    for mat in materials:
        mrp_type = mat.mrp_type.value if hasattr(mat.mrp_type, "value") else mat.mrp_type

        log("INFO", f"[{mat.number}] Processing — MRP type {mrp_type}, lot sizing {mat.lot_sizing_key}",
            {"mrp_type": mrp_type, "lot_sizing": str(mat.lot_sizing_key)}, mat.id)

        # ── Skip ND materials ─────────────────────────────────────────────────
        if mrp_type == "ND":
            log("DEBUG", f"[{mat.number}] Skipped (MRP type ND)", {}, mat.id)
            continue

        # ── Fetch stock ───────────────────────────────────────────────────────
        stock_rec = db.query(MaterialStock).filter(MaterialStock.material_id == mat.id).first()
        on_hand = stock_rec.quantity_on_hand if stock_rec else 0.0
        safety = mat.safety_stock or 0.0
        mat._current_stock = on_hand  # temp attr for lot sizing

        log("INFO", f"[{mat.number}] Stock: {on_hand:.1f} {mat.unit_of_measure} | Safety stock: {safety:.1f}",
            {"on_hand": on_hand, "safety_stock": safety, "uom": mat.unit_of_measure}, mat.id)

        if on_hand < safety:
            log("WARN", f"[{mat.number}] EX50 Stock below safety stock ({on_hand:.1f} < {safety:.1f})",
                {"on_hand": on_hand, "safety_stock": safety}, mat.id)
            ex = ExceptionMessage(
                run_id=run_id, material_id=mat.id, code="50",
                description=f"Stock {on_hand:.1f} below safety {safety:.1f}",
            )
            db.add(ex)
            total_ex += 1

        # ── Reorder Point Planning (VB / VM) ──────────────────────────────────
        if mrp_type in ("VB", "VM"):
            reorder_pt = mat.reorder_point or safety * 1.5
            log("INFO", f"[{mat.number}] Reorder point check: on-hand {on_hand:.1f} vs ROP {reorder_pt:.1f}",
                {"on_hand": on_hand, "reorder_point": reorder_pt}, mat.id)

            if on_hand <= reorder_pt:
                net_req = max(safety - on_hand, 1.0)
                qty = apply_lot_sizing(net_req, mat)
                req_date = today + timedelta(days=(mat.lead_time_days or 1))
                start_dt, finish_dt, sched_ex = schedule_planned_order(req_date, mat.lead_time_days or 1, today)

                log("INFO", f"[{mat.number}] ROP triggered: net req {net_req:.1f} -> order {qty:.1f} {mat.unit_of_measure}",
                    {"net_req": net_req, "order_qty": qty, "lot_sizing": str(mat.lot_sizing_key)}, mat.id)
                log("INFO", f"[{mat.number}] Scheduled: start {start_dt}, finish {finish_dt}",
                    {"planned_start": str(start_dt), "planned_finish": str(finish_dt)}, mat.id)

                all_ex = ["25"] + sched_ex
                po = PlannedOrder(
                    id=str(uuid.uuid4()),
                    run_id=run_id,
                    material_id=mat.id,
                    quantity=qty,
                    planned_start=datetime.combine(start_dt, datetime.min.time()),
                    planned_finish=datetime.combine(finish_dt, datetime.min.time()),
                    requirement_date=datetime.combine(req_date, datetime.min.time()),
                    lot_sizing_key=str(mat.lot_sizing_key.value if hasattr(mat.lot_sizing_key, "value") else mat.lot_sizing_key),
                    exception_codes=json.dumps(all_ex),
                    order_type="PR",
                )
                db.add(po)
                log("INFO", f"[{mat.number}] Created planned order {po.id[:8]}: {qty:.1f} EA",
                    {"po_id": po.id, "qty": qty, "exceptions": all_ex}, mat.id)

                for code in all_ex:
                    db.add(ExceptionMessage(
                        run_id=run_id, material_id=mat.id, code=code,
                        description=EXCEPTION_DESCRIPTIONS.get(code, code),
                        planned_order_id=po.id,
                    ))

                # ── BOM explosion ─────────────────────────────────────────────
                components = bom_by_parent.get(mat.id, [])
                if components:
                    log("INFO",
                        f"[{mat.number}] BOM explosion: {len(components)} components for {qty:.0f} units",
                        {"parent": mat.number, "planned_qty": qty, "component_count": len(components)},
                        mat.id)
                    for bi in components:
                        dep_qty = qty * bi.quantity_per
                        dep_req = Requirement(
                            material_id=bi.component_material_id,
                            quantity=dep_qty,
                            requirement_date=po.planned_start,
                            source="BOM_EXPLOSION",
                            reference_id=po.id,
                        )
                        db.add(dep_req)
                        comp_mat = db.query(Material).filter(Material.id == bi.component_material_id).first()
                        comp_num = comp_mat.number if comp_mat else bi.component_material_id[:8]
                        log("INFO",
                            f"[{mat.number}] -> {comp_num}: {dep_qty:.1f} "
                            f"{comp_mat.unit_of_measure if comp_mat else 'EA'} by {po.planned_start.date()}",
                            {"component": comp_num, "dep_qty": dep_qty,
                             "req_date": str(po.planned_start.date())},
                            bi.component_material_id)
                    db.flush()

                total_pos += 1
                total_ex += len(all_ex)
            else:
                log("INFO", f"[{mat.number}] Stock OK — no action needed",
                    {"on_hand": on_hand, "reorder_point": reorder_pt}, mat.id)

            mats_planned += 1
            db.flush()
            continue

        # ── Deterministic MRP (PD) ────────────────────────────────────────────
        requirements = (
            db.query(Requirement)
            .filter(Requirement.material_id == mat.id, Requirement.is_cancelled == False)  # noqa: E712
            .order_by(Requirement.requirement_date)
            .all()
        )

        log("INFO", f"[{mat.number}] {len(requirements)} open requirement(s)",
            {"count": len(requirements)}, mat.id)

        if not requirements:
            log("DEBUG", f"[{mat.number}] No requirements — no planned orders needed", {}, mat.id)
            mats_planned += 1
            continue

        projected = on_hand

        for req in requirements:
            req_date = req.requirement_date.date() if isinstance(req.requirement_date, datetime) else req.requirement_date
            gross = req.quantity
            net_req = max(0.0, gross - projected + safety)

            log("DEBUG",
                f"[{mat.number}] Req {req.id[:8]}: {gross:.1f} EA by {req_date} | PAB {projected:.1f} | net {net_req:.1f}",
                {"req_id": str(req.id), "gross": gross, "pab": projected, "net_req": net_req,
                 "req_date": str(req_date), "source": req.source}, mat.id)

            if net_req <= 0.0:
                projected -= gross
                log("INFO", f"[{mat.number}] Covered by stock (PAB -> {projected:.1f})",
                    {"pab_after": projected}, mat.id)
                continue

            # Need a planned order
            qty = apply_lot_sizing(net_req, mat)
            lsk = str(mat.lot_sizing_key.value if hasattr(mat.lot_sizing_key, "value") else mat.lot_sizing_key)

            if lsk == "EQ":
                annual = mat.annual_demand_est or (net_req * 12)
                eoq = calculate_eoq(annual, mat.ordering_cost or 50.0, mat.unit_price or 1.0)
                log("INFO", f"[{mat.number}] EOQ calc: D={annual:.0f}/yr, S={mat.ordering_cost}, H={mat.unit_price*0.25:.2f} -> EOQ={eoq:.1f}, order={qty:.1f}",
                    {"annual_demand": annual, "ordering_cost": mat.ordering_cost, "eoq": round(eoq, 2), "order_qty": qty}, mat.id)
            else:
                log("INFO", f"[{mat.number}] Lot sizing [{lsk}]: net {net_req:.1f} -> order {qty:.1f}",
                    {"lot_sizing": lsk, "net_req": net_req, "order_qty": qty}, mat.id)

            start_dt, finish_dt, sched_ex = schedule_planned_order(req_date, mat.lead_time_days or 1, today)
            log("INFO", f"[{mat.number}] Backward scheduling: need {req_date}, LT {mat.lead_time_days}d -> start {start_dt}, finish {finish_dt}",
                {"req_date": str(req_date), "lead_time": mat.lead_time_days,
                 "planned_start": str(start_dt), "planned_finish": str(finish_dt)}, mat.id)

            all_ex = ["25"] + sched_ex
            po = PlannedOrder(
                id=str(uuid.uuid4()),
                run_id=run_id,
                material_id=mat.id,
                quantity=qty,
                planned_start=datetime.combine(start_dt, datetime.min.time()),
                planned_finish=datetime.combine(finish_dt, datetime.min.time()),
                requirement_date=datetime.combine(req_date, datetime.min.time()),
                lot_sizing_key=lsk,
                exception_codes=json.dumps(all_ex),
                order_type="PR",
            )
            db.add(po)
            log("INFO", f"[{mat.number}] EX25 Created planned order {po.id[:8]}: {qty:.1f} EA, start {start_dt}, finish {finish_dt}",
                {"po_id": po.id, "qty": qty, "exceptions": all_ex}, mat.id)

            for code in all_ex:
                db.add(ExceptionMessage(
                    run_id=run_id, material_id=mat.id, code=code,
                    description=EXCEPTION_DESCRIPTIONS.get(code, code),
                    planned_order_id=po.id,
                ))

            # ── BOM explosion ─────────────────────────────────────────────────
            components = bom_by_parent.get(mat.id, [])
            if components:
                log("INFO",
                    f"[{mat.number}] BOM explosion: {len(components)} components for {qty:.0f} units",
                    {"parent": mat.number, "planned_qty": qty, "component_count": len(components)},
                    mat.id)
                for bi in components:
                    dep_qty = qty * bi.quantity_per
                    dep_req = Requirement(
                        material_id=bi.component_material_id,
                        quantity=dep_qty,
                        requirement_date=po.planned_start,
                        source="BOM_EXPLOSION",
                        reference_id=po.id,
                    )
                    db.add(dep_req)
                    comp_mat = db.query(Material).filter(Material.id == bi.component_material_id).first()
                    comp_num = comp_mat.number if comp_mat else bi.component_material_id[:8]
                    log("INFO",
                        f"[{mat.number}] -> {comp_num}: {dep_qty:.1f} "
                        f"{comp_mat.unit_of_measure if comp_mat else 'EA'} by {po.planned_start.date()}",
                        {"component": comp_num, "dep_qty": dep_qty,
                         "req_date": str(po.planned_start.date())},
                        bi.component_material_id)
                db.flush()

            projected = projected - gross + qty
            log("DEBUG", f"[{mat.number}] PAB after order: {projected:.1f}",
                {"pab": projected}, mat.id)

            total_pos += 1
            total_ex += len(all_ex)

        mats_planned += 1
        db.flush()

    db.commit()
    summary = {
        "materials_planned": mats_planned,
        "planned_orders_created": total_pos,
        "exception_count": total_ex,
    }
    log("INFO", f"MRP run {run_id[:8]} complete: {mats_planned} materials, {total_pos} planned orders, {total_ex} exceptions",
        summary)
    return summary
