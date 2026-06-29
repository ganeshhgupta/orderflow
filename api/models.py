# api/models.py
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, Float, Integer, String, Text

from .database import Base


class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    DEAD = "DEAD"
    CANCELLED = "CANCELLED"


class Order(Base):
    __tablename__ = "orders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    item = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    status = Column(SAEnum(OrderStatus), default=OrderStatus.PENDING, nullable=False)
    retry_count = Column(Integer, default=0)
    error_msg = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)


class OrderEvent(Base):
    __tablename__ = "order_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(String(36), nullable=False, index=True)
    topic = Column(String(64), nullable=False)
    payload = Column(Text, nullable=False)
    ts = Column(DateTime, default=datetime.utcnow)


# ── MRP enums ─────────────────────────────────────────────────────────────────

class MRPType(str, enum.Enum):
    PD = "PD"   # Deterministic MRP (demand-driven)
    VB = "VB"   # Reorder Point Planning (manual)
    VM = "VM"   # Reorder Point Planning (automatic)
    ND = "ND"   # No planning


class LotSizingKey(str, enum.Enum):
    EX = "EX"   # Lot-for-lot (exact requirement)
    FX = "FX"   # Fixed lot size
    HB = "HB"   # Replenish to max stock level
    EQ = "EQ"   # Economic Order Quantity


class MRPLogLevel(str, enum.Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


# ── MRP master data ────────────────────────────────────────────────────────────

class Material(Base):
    __tablename__ = "materials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    number = Column(String(18), unique=True, nullable=False)
    description = Column(String(255), nullable=False)
    unit_of_measure = Column(String(10), default="EA")
    procurement_type = Column(String(1), default="F")  # F=external, E=internal
    mrp_type = Column(SAEnum(MRPType), default=MRPType.PD, nullable=False)
    lot_sizing_key = Column(SAEnum(LotSizingKey), default=LotSizingKey.EX, nullable=False)
    lead_time_days = Column(Integer, default=7, nullable=False)
    safety_stock = Column(Float, default=0.0)
    reorder_point = Column(Float, default=0.0)
    min_order_qty = Column(Float, default=1.0)
    max_order_qty = Column(Float, nullable=True)
    fixed_lot_size = Column(Float, nullable=True)
    rounding_value = Column(Float, nullable=True)
    max_stock_level = Column(Float, nullable=True)
    unit_price = Column(Float, default=1.0)
    ordering_cost = Column(Float, default=50.0)
    annual_demand_est = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MaterialStock(Base):
    __tablename__ = "material_stock"

    id = Column(Integer, primary_key=True, autoincrement=True)
    material_id = Column(String(36), nullable=False, index=True)
    quantity_on_hand = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Requirement(Base):
    __tablename__ = "requirements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    material_id = Column(String(36), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    requirement_date = Column(DateTime, nullable=False)
    source = Column(String(32), default="MANUAL")  # SALES_ORDER, FORECAST, MANUAL
    reference_id = Column(String(36), nullable=True)
    is_cancelled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class PlannedOrder(Base):
    __tablename__ = "planned_orders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String(36), nullable=False, index=True)
    material_id = Column(String(36), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    planned_start = Column(DateTime, nullable=False)
    planned_finish = Column(DateTime, nullable=False)
    requirement_date = Column(DateTime, nullable=False)
    lot_sizing_key = Column(String(3), nullable=False)
    exception_codes = Column(Text, default="[]")  # JSON list of codes
    order_type = Column(String(4), default="PR")   # PR=purchase requisition
    is_converted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class MRPRun(Base):
    __tablename__ = "mrp_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    triggered_by = Column(String(64), default="API")
    status = Column(String(16), default="RUNNING")  # RUNNING, COMPLETED, FAILED
    materials_planned = Column(Integer, default=0)
    planned_orders_created = Column(Integer, default=0)
    exception_count = Column(Integer, default=0)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class MRPLog(Base):
    __tablename__ = "mrp_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(36), nullable=False, index=True)
    level = Column(SAEnum(MRPLogLevel), nullable=False)
    message = Column(Text, nullable=False)
    payload = Column(Text, default="{}")  # JSON extra data
    material_id = Column(String(36), nullable=True)
    ts = Column(DateTime, default=datetime.utcnow)


class ExceptionMessage(Base):
    __tablename__ = "exception_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(36), nullable=False, index=True)
    material_id = Column(String(36), nullable=False)
    code = Column(String(4), nullable=False)
    description = Column(String(255), nullable=False)
    planned_order_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BOMItem(Base):
    __tablename__ = "bom_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_material_id = Column(String(36), nullable=False, index=True)
    component_material_id = Column(String(36), nullable=False, index=True)
    quantity_per = Column(Float, nullable=False, default=1.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
