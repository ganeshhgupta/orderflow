# tests/test_mrp_adversarial.py
"""
Adversarial MRP test suite.
Covers edge cases: negative stock, past-due requirements, zero lead time,
EOQ with zero demand, concurrent runs, etc.

Run:  pytest tests/test_mrp_adversarial.py -v
"""
import json
import math
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
    MRPRun, MRPLog, MRPLogLevel, ExceptionMessage,
    MRPType, LotSizingKey,
)
from mrp.engine import (
    calculate_eoq, apply_lot_sizing, schedule_planned_order, run_full_mrp,
)


# ── In-memory SQLite for tests ─────────────────────────────────────────────────

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


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


def _req(db, material_id, qty, days_from_now=14, source="MANUAL") -> Requirement:
    r = Requirement(
        material_id=material_id,
        quantity=qty,
        requirement_date=datetime.utcnow() + timedelta(days=days_from_now),
        source=source,
    )
    db.add(r)
    db.flush()
    return r


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


# ── EOQ formula tests ──────────────────────────────────────────────────────────

def test_eoq_standard():
    # D=1200, S=50, C=10, H=2.5 -> EOQ = sqrt(2*1200*50/2.5) = sqrt(48000) ≈ 219.09
    result = calculate_eoq(1200, 50, 10, 0.25)
    assert abs(result - math.sqrt(48000)) < 0.01


def test_eoq_zero_demand_returns_one():
    assert calculate_eoq(0, 50, 10) == 1.0


def test_eoq_zero_price_returns_one():
    assert calculate_eoq(1000, 50, 0) == 1.0


def test_eoq_zero_ordering_cost_returns_one():
    assert calculate_eoq(1000, 0, 10) == 1.0


# ── Lot sizing tests ───────────────────────────────────────────────────────────

def test_lot_sizing_ex_exact():
    mat = _build_mat(lot_sizing_key=LotSizingKey.EX)
    assert apply_lot_sizing(47.0, mat) == 47.0


def test_lot_sizing_fx_rounds_up():
    mat = _build_mat(lot_sizing_key=LotSizingKey.FX, fixed_lot_size=100.0)
    assert apply_lot_sizing(50.0, mat) == 100.0
    assert apply_lot_sizing(100.0, mat) == 100.0
    assert apply_lot_sizing(101.0, mat) == 200.0


def test_lot_sizing_fx_with_min_order():
    mat = _build_mat(lot_sizing_key=LotSizingKey.FX, fixed_lot_size=50.0, min_order_qty=60.0)
    result = apply_lot_sizing(10.0, mat)
    assert result >= 60.0


def test_lot_sizing_eq_at_least_net_req():
    mat = _build_mat(lot_sizing_key=LotSizingKey.EQ, annual_demand_est=1200.0,
                     ordering_cost=50.0, unit_price=10.0)
    net = 300.0
    result = apply_lot_sizing(net, mat)
    assert result >= net


def test_lot_sizing_max_order_cap():
    mat = _build_mat(lot_sizing_key=LotSizingKey.EX, max_order_qty=100.0)
    result = apply_lot_sizing(500.0, mat)
    assert result == 100.0


def test_lot_sizing_rounding_value():
    mat = _build_mat(lot_sizing_key=LotSizingKey.EX, rounding_value=25.0)
    assert apply_lot_sizing(26.0, mat) == 50.0
    assert apply_lot_sizing(25.0, mat) == 25.0


def _build_mat(**kwargs):
    """Build a Material-like object without a DB."""
    class FakeMaterial:
        pass
    m = FakeMaterial()
    defaults = dict(
        lot_sizing_key=LotSizingKey.EX,
        fixed_lot_size=None,
        max_stock_level=None,
        _current_stock=0.0,
        annual_demand_est=None,
        ordering_cost=50.0,
        unit_price=10.0,
        min_order_qty=1.0,
        max_order_qty=None,
        rounding_value=None,
    )
    defaults.update(kwargs)
    for k, v in defaults.items():
        setattr(m, k, v)
    return m


# ── Scheduling tests ──────────────────────────────────────────────────────────

def test_schedule_backward_ok():
    today = datetime.utcnow().date()
    req_date = today + timedelta(days=20)
    start, finish, exceptions = schedule_planned_order(req_date, 7, today)
    assert start < finish
    assert finish <= req_date
    assert "02" not in exceptions


def test_schedule_zero_lead_time():
    today = datetime.utcnow().date()
    req_date = today + timedelta(days=5)
    start, finish, exceptions = schedule_planned_order(req_date, 0, today)
    assert start >= today


def test_schedule_past_due_triggers_ex02():
    today = datetime.utcnow().date()
    req_date = today - timedelta(days=3)  # past due
    start, finish, exceptions = schedule_planned_order(req_date, 7, today)
    assert "02" in exceptions


def test_schedule_past_due_with_long_lt_triggers_ex07():
    today = datetime.utcnow().date()
    req_date = today + timedelta(days=2)
    start, finish, exceptions = schedule_planned_order(req_date, 14, today)  # LT longer than window
    assert "02" in exceptions
    assert "07" in exceptions  # finish after requirement


# ── Full MRP run tests ─────────────────────────────────────────────────────────

def test_mrp_no_requirements_no_planned_orders(db):
    mat = _material(db, mrp_type=MRPType.PD)
    _stock(db, mat.id, 100.0)
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    assert summary["planned_orders_created"] == 0


def test_mrp_requirement_fully_covered_by_stock(db):
    mat = _material(db, safety_stock=0.0)
    _stock(db, mat.id, 200.0)
    _req(db, mat.id, 100.0, days_from_now=14)
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    assert summary["planned_orders_created"] == 0


def test_mrp_requirement_exceeds_stock_creates_planned_order(db):
    mat = _material(db, safety_stock=0.0)
    _stock(db, mat.id, 50.0)
    _req(db, mat.id, 200.0, days_from_now=14)
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    assert summary["planned_orders_created"] == 1
    po = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id).first()
    assert po is not None
    assert po.quantity >= 150.0  # net = 200 - 50 = 150


def test_mrp_safety_stock_respected(db):
    mat = _material(db, safety_stock=100.0)
    _stock(db, mat.id, 120.0)  # above safety, but req will dip below
    _req(db, mat.id, 100.0, days_from_now=14)
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    # net = max(0, 100 - 120 + 100) = 80
    assert summary["planned_orders_created"] == 1
    po = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id).first()
    assert po.quantity >= 80.0


def test_mrp_nd_material_skipped(db):
    mat = _material(db, mrp_type=MRPType.ND)
    _stock(db, mat.id, 0.0)
    _req(db, mat.id, 500.0, days_from_now=5)
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    assert summary["planned_orders_created"] == 0


def test_mrp_vb_reorder_point_triggers(db):
    mat = _material(db, mrp_type=MRPType.VB, reorder_point=100.0, safety_stock=50.0)
    _stock(db, mat.id, 80.0)  # below ROP
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    assert summary["planned_orders_created"] == 1


def test_mrp_vb_above_reorder_point_no_order(db):
    mat = _material(db, mrp_type=MRPType.VB, reorder_point=100.0, safety_stock=50.0)
    _stock(db, mat.id, 150.0)  # above ROP
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    assert summary["planned_orders_created"] == 0


def test_mrp_past_due_requirement_triggers_ex02(db):
    mat = _material(db, lead_time_days=14)
    _stock(db, mat.id, 0.0)
    _req(db, mat.id, 100.0, days_from_now=-5)  # already past due
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    assert summary["planned_orders_created"] == 1
    po = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id).first()
    codes = json.loads(po.exception_codes)
    assert "02" in codes


def test_mrp_below_safety_stock_triggers_ex50(db):
    mat = _material(db, safety_stock=100.0)
    _stock(db, mat.id, 40.0)  # below safety
    run_id = _run(db)
    _execute(db, run_id)
    ex50 = db.query(ExceptionMessage).filter(
        ExceptionMessage.run_id == run_id,
        ExceptionMessage.code == "50",
    ).first()
    assert ex50 is not None


def test_mrp_fixed_lot_sizing_rounds_up(db):
    mat = _material(db, lot_sizing_key=LotSizingKey.FX, fixed_lot_size=128.0, safety_stock=0.0)
    _stock(db, mat.id, 0.0)
    _req(db, mat.id, 50.0, days_from_now=14)
    run_id = _run(db)
    _execute(db, run_id)
    po = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id).first()
    assert po is not None
    assert po.quantity == 128.0


def test_mrp_eoq_lot_sizing_at_least_net_req(db):
    mat = _material(db, lot_sizing_key=LotSizingKey.EQ, annual_demand_est=1200.0,
                     ordering_cost=50.0, unit_price=10.0, safety_stock=0.0)
    _stock(db, mat.id, 0.0)
    _req(db, mat.id, 50.0, days_from_now=21)
    run_id = _run(db)
    _execute(db, run_id)
    po = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id).first()
    assert po is not None
    assert po.quantity >= 50.0


def test_mrp_multiple_requirements_accumulate(db):
    mat = _material(db, safety_stock=0.0)
    _stock(db, mat.id, 30.0)
    _req(db, mat.id, 50.0, days_from_now=10)   # net=20, creates PO
    _req(db, mat.id, 80.0, days_from_now=20)   # PAB after first PO adds stock
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    # At least one planned order, possibly two depending on PAB propagation
    assert summary["planned_orders_created"] >= 1


def test_mrp_cancelled_requirement_not_planned(db):
    mat = _material(db, safety_stock=0.0)
    _stock(db, mat.id, 0.0)
    r = _req(db, mat.id, 100.0, days_from_now=14)
    r.is_cancelled = True
    db.flush()
    run_id = _run(db)
    summary, _ = _execute(db, run_id)
    assert summary["planned_orders_created"] == 0


def test_mrp_concurrent_runs_isolated(db):
    mat = _material(db, safety_stock=0.0)
    _stock(db, mat.id, 0.0)
    _req(db, mat.id, 100.0, days_from_now=14)

    run_id_1 = _run(db)
    run_id_2 = _run(db)

    _execute(db, run_id_1)
    _execute(db, run_id_2)

    pos_run1 = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id_1).count()
    pos_run2 = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id_2).count()
    assert pos_run1 == pos_run2 == 1
    # Each run has its own planned orders, not shared
    total = db.query(PlannedOrder).count()
    assert total == 2


def test_mrp_zero_stock_full_requirement_ordered(db):
    mat = _material(db, safety_stock=0.0)
    _stock(db, mat.id, 0.0)
    _req(db, mat.id, 300.0, days_from_now=14)
    run_id = _run(db)
    _execute(db, run_id)
    po = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id).first()
    assert po is not None
    assert po.quantity == 300.0


def test_mrp_exception_message_25_on_new_order(db):
    mat = _material(db, safety_stock=0.0)
    _stock(db, mat.id, 0.0)
    _req(db, mat.id, 100.0, days_from_now=14)
    run_id = _run(db)
    _execute(db, run_id)
    ex25 = db.query(ExceptionMessage).filter(
        ExceptionMessage.run_id == run_id,
        ExceptionMessage.code == "25",
    ).first()
    assert ex25 is not None
