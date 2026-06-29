# tests/test_bom_explosion.py
"""
BOM explosion test suite.
Tests low-level code computation, single-level explosion, multi-level explosion,
quantity scaling, ND component handling, and requirement idempotency.

Run:  pytest tests/test_bom_explosion.py -v
"""
import os
import sys
import uuid
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api import models
from api.models import (
    Material, MaterialStock, Requirement, PlannedOrder,
    MRPRun, ExceptionMessage,
    MRPType, LotSizingKey, BOMItem,
)
from mrp.engine import run_full_mrp, compute_low_level_codes


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _material(db, **kwargs) -> Material:
    defaults = dict(
        number=f"T{uuid.uuid4().hex[:6].upper()}",
        description="Test material",
        mrp_type=MRPType.PD,
        lot_sizing_key=LotSizingKey.EX,
        lead_time_days=7,
        safety_stock=0.0,
        reorder_point=0.0,
        min_order_qty=1.0,
        unit_price=10.0,
        ordering_cost=50.0,
        unit_of_measure="EA",
    )
    defaults.update(kwargs)
    m = Material(**defaults)
    db.add(m)
    db.flush()
    return m


def _stock(db, material_id, qty) -> MaterialStock:
    s = MaterialStock(material_id=material_id, quantity_on_hand=qty)
    db.add(s)
    db.flush()
    return s


def _req(db, material_id, qty, days_from_now=14, source="SALES_ORDER") -> Requirement:
    r = Requirement(
        material_id=material_id,
        quantity=float(qty),
        requirement_date=datetime.utcnow() + timedelta(days=days_from_now),
        source=source,
    )
    db.add(r)
    db.flush()
    return r


def _bom(db, parent_id, component_id, qty_per=1.0) -> BOMItem:
    b = BOMItem(parent_material_id=parent_id, component_material_id=component_id, quantity_per=qty_per)
    db.add(b)
    db.flush()
    return b


def _run(db) -> str:
    run_id = str(uuid.uuid4())
    run = MRPRun(id=run_id, status="RUNNING")
    db.add(run)
    db.flush()
    return run_id


def _execute(db, run_id):
    logs = []

    def log(level, msg, payload, material_id=None):
        logs.append({"level": level, "msg": msg})

    summary = run_full_mrp(run_id, db, log)
    return summary, logs


# ── Low-level code tests ───────────────────────────────────────────────────────

def test_llc_no_bom_empty():
    assert compute_low_level_codes([]) == {}


def test_llc_single_level():
    class FakeBOM:
        pass
    bi = FakeBOM()
    bi.parent_material_id = "PARENT"
    bi.component_material_id = "COMP"
    bi.is_active = True
    llc = compute_low_level_codes([bi])
    assert llc["PARENT"] == 0
    assert llc["COMP"] == 1


def test_llc_two_levels():
    class FakeBOM:
        pass

    def make(p, c):
        b = FakeBOM()
        b.parent_material_id = p
        b.component_material_id = c
        b.is_active = True
        return b

    items = [make("FG", "SEMI"), make("SEMI", "RAW")]
    llc = compute_low_level_codes(items)
    assert llc["FG"] == 0
    assert llc["SEMI"] == 1
    assert llc["RAW"] == 2


def test_llc_shared_component_gets_max_depth():
    """A component used at two different BOM depths gets the deeper (max) LLC."""
    class FakeBOM:
        pass

    def make(p, c):
        b = FakeBOM()
        b.parent_material_id = p
        b.component_material_id = c
        b.is_active = True
        return b

    # FG-A -> SEMI -> SHARED   (depth 2)
    # FG-B -> SHARED            (depth 1)
    items = [make("FG-A", "SEMI"), make("SEMI", "SHARED"), make("FG-B", "SHARED")]
    llc = compute_low_level_codes(items)
    assert llc["SHARED"] == 2


# ── BOM explosion integration tests ───────────────────────────────────────────

def test_bom_explosion_creates_component_requirement(db):
    """Planning a parent creates a BOM_EXPLOSION requirement for its component."""
    parent = _material(db, number="FG-001", description="Finished Good", lead_time_days=2)
    comp = _material(db, number="COMP-001", description="Component", lead_time_days=7)
    _stock(db, parent.id, 0.0)
    _stock(db, comp.id, 0.0)
    _bom(db, parent.id, comp.id, qty_per=1.0)
    _req(db, parent.id, 10.0, days_from_now=20)

    run_id = _run(db)
    _execute(db, run_id)

    parent_pos = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id,
        PlannedOrder.material_id == parent.id,
    ).all()
    assert len(parent_pos) == 1

    dep_reqs = db.query(Requirement).filter(
        Requirement.material_id == comp.id,
        Requirement.source == "BOM_EXPLOSION",
    ).all()
    assert len(dep_reqs) == 1
    assert dep_reqs[0].quantity == 10.0


def test_bom_explosion_quantity_scaling(db):
    """qty_per=2: planning 10 parents creates a component requirement of 20."""
    parent = _material(db, number="FG-QTY", description="Assembly", lead_time_days=2)
    comp = _material(db, number="COMP-2X", description="Dual component", lead_time_days=7)
    _stock(db, parent.id, 0.0)
    _stock(db, comp.id, 0.0)
    _bom(db, parent.id, comp.id, qty_per=2.0)
    _req(db, parent.id, 10.0, days_from_now=20)

    run_id = _run(db)
    _execute(db, run_id)

    dep_req = db.query(Requirement).filter(
        Requirement.material_id == comp.id,
        Requirement.source == "BOM_EXPLOSION",
    ).first()
    assert dep_req is not None
    assert dep_req.quantity == 20.0


def test_bom_explosion_component_gets_planned_order(db):
    """Component with a BOM_EXPLOSION requirement and no stock gets its own planned order."""
    parent = _material(db, number="FG-PO", description="Assembly", lead_time_days=2)
    comp = _material(db, number="COMP-PO", description="Component needing order", lead_time_days=7)
    _stock(db, parent.id, 0.0)
    _stock(db, comp.id, 0.0)
    _bom(db, parent.id, comp.id, qty_per=1.0)
    _req(db, parent.id, 10.0, days_from_now=30)

    run_id = _run(db)
    summary, _ = _execute(db, run_id)

    parent_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == parent.id,
    ).first()
    comp_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == comp.id,
    ).first()
    assert parent_po is not None
    assert comp_po is not None
    assert summary["planned_orders_created"] == 2


def test_bom_explosion_component_covered_by_stock_no_planned_order(db):
    """If component stock covers the BOM requirement, no planned order is generated for it."""
    parent = _material(db, number="FG-COV", description="Assembly", lead_time_days=2)
    comp = _material(db, number="COMP-COV", description="Well-stocked component", lead_time_days=7)
    _stock(db, parent.id, 0.0)
    _stock(db, comp.id, 100.0)
    _bom(db, parent.id, comp.id, qty_per=1.0)
    _req(db, parent.id, 10.0, days_from_now=30)

    run_id = _run(db)
    summary, _ = _execute(db, run_id)

    parent_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == parent.id,
    ).first()
    assert parent_po is not None

    comp_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == comp.id,
    ).first()
    assert comp_po is None
    assert summary["planned_orders_created"] == 1


def test_bom_explosion_nd_component_gets_requirement_no_planned_order(db):
    """ND components receive the explosion requirement but the engine skips planning them."""
    parent = _material(db, number="FG-ND", description="Assembly", lead_time_days=2)
    nd_comp = _material(db, number="COMP-ND", description="ND component",
                        mrp_type=MRPType.ND, lead_time_days=3)
    _stock(db, parent.id, 0.0)
    _stock(db, nd_comp.id, 0.0)
    _bom(db, parent.id, nd_comp.id, qty_per=1.0)
    _req(db, parent.id, 5.0, days_from_now=20)

    run_id = _run(db)
    _execute(db, run_id)

    dep_req = db.query(Requirement).filter(
        Requirement.material_id == nd_comp.id,
        Requirement.source == "BOM_EXPLOSION",
    ).first()
    assert dep_req is not None

    nd_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == nd_comp.id,
    ).first()
    assert nd_po is None


def test_bom_explosion_dep_requirements_cleared_on_new_run(db):
    """BOM_EXPLOSION requirements do not accumulate across multiple runs."""
    parent = _material(db, number="FG-CLR", description="Assembly", lead_time_days=2)
    comp = _material(db, number="COMP-CLR", description="Component", lead_time_days=7)
    _stock(db, parent.id, 0.0)
    _stock(db, comp.id, 0.0)
    _bom(db, parent.id, comp.id, qty_per=1.0)
    _req(db, parent.id, 10.0, days_from_now=30)

    run_id_1 = _run(db)
    _execute(db, run_id_1)

    count_after_run1 = db.query(Requirement).filter(
        Requirement.source == "BOM_EXPLOSION"
    ).count()
    assert count_after_run1 >= 1

    run_id_2 = _run(db)
    _execute(db, run_id_2)

    count_after_run2 = db.query(Requirement).filter(
        Requirement.source == "BOM_EXPLOSION"
    ).count()
    assert count_after_run2 == count_after_run1


def test_bom_explosion_dep_req_links_to_planned_order(db):
    """BOM_EXPLOSION requirement.reference_id points to the triggering planned order."""
    parent = _material(db, number="FG-REF", description="Assembly", lead_time_days=2)
    comp = _material(db, number="COMP-REF", description="Component", lead_time_days=7)
    _stock(db, parent.id, 0.0)
    _stock(db, comp.id, 0.0)
    _bom(db, parent.id, comp.id, qty_per=1.0)
    _req(db, parent.id, 10.0, days_from_now=30)

    run_id = _run(db)
    _execute(db, run_id)

    parent_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == parent.id,
    ).first()
    dep_req = db.query(Requirement).filter(
        Requirement.material_id == comp.id,
        Requirement.source == "BOM_EXPLOSION",
    ).first()

    assert parent_po is not None
    assert dep_req is not None
    assert dep_req.reference_id == parent_po.id


def test_bom_explosion_two_level(db):
    """Multi-level: FG -> SEMI -> RAW. All three materials get planned orders."""
    fg = _material(db, number="FG-2L", description="Finished Good", lead_time_days=2)
    semi = _material(db, number="SEMI-2L", description="Semi-Finished", lead_time_days=5)
    raw = _material(db, number="RAW-2L", description="Raw Material", lead_time_days=14)
    _stock(db, fg.id, 0.0)
    _stock(db, semi.id, 0.0)
    _stock(db, raw.id, 0.0)
    _bom(db, fg.id, semi.id, qty_per=1.0)   # 1 SEMI per FG
    _bom(db, semi.id, raw.id, qty_per=3.0)  # 3 RAW per SEMI

    _req(db, fg.id, 10.0, days_from_now=40)

    run_id = _run(db)
    summary, _ = _execute(db, run_id)

    fg_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == fg.id,
    ).first()
    semi_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == semi.id,
    ).first()
    raw_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == raw.id,
    ).first()

    assert fg_po is not None, "FG should have a planned order"
    assert semi_po is not None, "SEMI should have a planned order (BOM explosion from FG)"
    assert raw_po is not None, "RAW should have a planned order (BOM explosion from SEMI)"

    assert semi_po.quantity == 10.0  # 10 FG × 1
    assert raw_po.quantity == 30.0   # 10 SEMI × 3
    assert summary["planned_orders_created"] == 3


def test_bom_explosion_component_safety_stock_respected(db):
    """Component PO covers both the exploded requirement and the component's safety stock."""
    parent = _material(db, number="FG-SS", description="Assembly", lead_time_days=2)
    comp = _material(db, number="COMP-SS", description="Component with safety stock",
                     safety_stock=50.0, lead_time_days=7)
    _stock(db, parent.id, 0.0)
    _stock(db, comp.id, 0.0)
    _bom(db, parent.id, comp.id, qty_per=1.0)
    _req(db, parent.id, 10.0, days_from_now=30)

    run_id = _run(db)
    _execute(db, run_id)

    comp_po = db.query(PlannedOrder).filter(
        PlannedOrder.run_id == run_id, PlannedOrder.material_id == comp.id,
    ).first()
    assert comp_po is not None
    # net = max(0, 10 - 0 + 50) = 60 with EX lot sizing
    assert comp_po.quantity >= 60.0


def test_bom_explosion_multiple_components(db):
    """A parent with 3 BOM components generates 3 dependent requirements."""
    parent = _material(db, number="FG-3C", description="3-component Assembly", lead_time_days=2)
    comps = [
        _material(db, number=f"COMP-3C-{i}", description=f"Component {i}", lead_time_days=7)
        for i in range(3)
    ]
    _stock(db, parent.id, 0.0)
    for c in comps:
        _stock(db, c.id, 0.0)
        _bom(db, parent.id, c.id, qty_per=1.0)
    _req(db, parent.id, 5.0, days_from_now=30)

    run_id = _run(db)
    _execute(db, run_id)

    dep_reqs = db.query(Requirement).filter(Requirement.source == "BOM_EXPLOSION").all()
    assert len(dep_reqs) == 3
    for dr in dep_reqs:
        assert dr.quantity == 5.0


def test_bom_explosion_no_bom_no_dep_reqs(db):
    """A standalone material with no BOM entries produces no BOM_EXPLOSION requirements."""
    mat = _material(db, number="STANDALONE", description="No BOM material")
    _stock(db, mat.id, 0.0)
    _req(db, mat.id, 50.0, days_from_now=14)

    run_id = _run(db)
    _execute(db, run_id)

    dep_reqs = db.query(Requirement).filter(Requirement.source == "BOM_EXPLOSION").all()
    assert len(dep_reqs) == 0


def test_bom_explosion_parent_stock_covers_req_no_dep_reqs(db):
    """If parent stock covers the requirement (no PO), no BOM explosion occurs."""
    parent = _material(db, number="FG-COVERED", description="Assembly with stock", lead_time_days=2)
    comp = _material(db, number="COMP-NOCALL", description="Component", lead_time_days=7)
    _stock(db, parent.id, 100.0)  # covers the 10-unit requirement
    _stock(db, comp.id, 0.0)
    _bom(db, parent.id, comp.id, qty_per=1.0)
    _req(db, parent.id, 10.0, days_from_now=30)

    run_id = _run(db)
    summary, _ = _execute(db, run_id)

    assert summary["planned_orders_created"] == 0

    dep_reqs = db.query(Requirement).filter(Requirement.source == "BOM_EXPLOSION").all()
    assert len(dep_reqs) == 0
