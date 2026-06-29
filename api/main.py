import asyncio
import collections
import csv
import io
import json
import os
import subprocess
import sys
import time as _time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import redis_client as _rc

from . import models
from .database import engine, get_db, SessionLocal
from .models import (
    Order, OrderEvent, OrderStatus,
    Material, MaterialStock, Requirement, PlannedOrder,
    MRPRun, MRPLog, MRPLogLevel, ExceptionMessage,
    MRPType, LotSizingKey, BOMItem,
)
from .schemas import MetricsResponse, OrderCreate, OrderResponse

try:
    models.Base.metadata.create_all(bind=engine)
except Exception as _db_init_err:
    import logging as _log
    _log.getLogger(__name__).error("DB init failed: %s", _db_init_err)

app = FastAPI(
    title="OrderFlow API",
    version="1.0.0",
    description="Distributed order processing: Redis queue · Kafka events · PostgreSQL persistence",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_redis = _rc._redis

# ── Metrics ring buffer (150 samples × 3 s = 7.5 min of history) ──────────────
_metrics_history: collections.deque = collections.deque(maxlen=150)


async def _metrics_sampler() -> None:
    """Background task: snapshot metrics every 3 s into the ring buffer."""
    while True:
        await asyncio.sleep(3)
        try:
            db = SessionLocal()
            counts = db.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
            db.close()
            by_status = {s: c for s, c in counts}
            now = _time.time()
            active_workers = _redis.zrangebyscore("workers:active", now - 30, "+inf")
            completed = by_status.get(OrderStatus.COMPLETED, 0)
            prev_completed = _metrics_history[-1]["completed"] if _metrics_history else completed
            _metrics_history.append({
                "ts": datetime.utcnow().isoformat(),
                "queue_depth": int(_redis.llen("orders:queue")),
                "dlq_depth": int(_redis.llen("orders:dlq")),
                "processing": by_status.get(OrderStatus.PROCESSING, 0),
                "completed": completed,
                "failed": by_status.get(OrderStatus.FAILED, 0),
                "dead": by_status.get(OrderStatus.DEAD, 0),
                "workers": len(active_workers),
                "throughput": max(0, completed - prev_completed),
            })
        except Exception:
            pass


@app.on_event("startup")
async def _start_sampler():
    asyncio.create_task(_metrics_sampler())


@app.get("/")
def root():
    return {"status": "ok", "service": "OrderFlow API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok", "mode": "fakeredis" if _rc.REDIS_FAKE else "redis"}


@app.post("/orders", response_model=OrderResponse, status_code=201)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    order = Order(item=payload.item, quantity=payload.quantity, price=payload.price)
    db.add(order)
    db.commit()
    db.refresh(order)

    _redis.rpush("orders:queue", json.dumps({"order_id": order.id, "retry_count": 0}))

    order.status = OrderStatus.QUEUED
    db.commit()
    db.refresh(order)
    return order


@app.get("/orders/timeline")
def orders_timeline(db: Session = Depends(get_db)):
    rows = (
        db.query(
            func.strftime("%Y-%m-%dT%H:00:00", Order.created_at).label("hour"),
            func.count(Order.id).label("count"),
        )
        .group_by(func.strftime("%Y-%m-%dT%H:00:00", Order.created_at))
        .order_by(func.strftime("%Y-%m-%dT%H:00:00", Order.created_at))
        .all()
    )
    return [{"hour": r.hour, "count": r.count} for r in rows]


@app.get("/orders", response_model=List[OrderResponse])
def list_orders(
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Order)
    if status:
        try:
            q = q.filter(Order.status == OrderStatus(status.upper()))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status '{status}'. Valid: PENDING, QUEUED, PROCESSING, COMPLETED, FAILED, DEAD",
            )
    return q.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()


@app.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.post("/orders/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in (OrderStatus.QUEUED, OrderStatus.PENDING):
        raise HTTPException(status_code=400, detail=f"Cannot cancel order in status {order.status.value}")
    order.status = OrderStatus.CANCELLED
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    for raw in _redis.lrange("orders:queue", 0, -1):
        try:
            entry = json.loads(raw)
            if entry.get("order_id") == order_id:
                _redis.lrem("orders:queue", 1, raw)
                break
        except Exception:
            pass
    return order


@app.get("/orders/export/csv")
def export_orders_csv(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Order)
    if status:
        try:
            q = q.filter(Order.status == OrderStatus(status.upper()))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status '{status}'")
    orders = q.order_by(Order.created_at.desc()).limit(5000).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "item", "quantity", "price", "status", "retry_count", "error_msg", "created_at", "updated_at", "processed_at"])
    for o in orders:
        writer.writerow([
            o.id, o.item, o.quantity, f"{o.price:.2f}", o.status.value,
            o.retry_count, o.error_msg or "",
            o.created_at.isoformat() if o.created_at else "",
            o.updated_at.isoformat() if o.updated_at else "",
            o.processed_at.isoformat() if o.processed_at else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


@app.get("/orders/{order_id}/events")
def get_order_events(order_id: str, db: Session = Depends(get_db)):
    events = (
        db.query(OrderEvent)
        .filter(OrderEvent.order_id == order_id)
        .order_by(OrderEvent.ts)
        .all()
    )
    return [{"topic": e.topic, "payload": json.loads(e.payload), "ts": e.ts.isoformat()} for e in events]


@app.get("/events/stream")
async def stream_events():
    """SSE: live order events from the in-process Kafka bus."""
    import queue as _queue
    from events.bus import broker, ORDER_TOPICS

    q = broker.subscribe(ORDER_TOPICS)

    async def generate():
        try:
            while True:
                try:
                    msg = q.get_nowait()
                    yield f"data: {json.dumps(msg)}\n\n"
                except _queue.Empty:
                    await asyncio.sleep(0.1)
                    yield ": heartbeat\n\n"
        finally:
            broker.unsubscribe(q)

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/events/recent")
def recent_events(limit: int = 100, db: Session = Depends(get_db)):
    """Last N order events from DB for initial page load."""
    events = (
        db.query(OrderEvent)
        .order_by(OrderEvent.ts.desc())
        .limit(limit)
        .all()
    )
    return [
        {"id": e.id, "order_id": e.order_id, "topic": e.topic,
         "payload": json.loads(e.payload), "ts": e.ts.isoformat()}
        for e in reversed(events)
    ]


@app.get("/dlq", response_model=List[OrderResponse])
def list_dlq(db: Session = Depends(get_db)):
    orders = (
        db.query(Order)
        .filter(Order.status == OrderStatus.DEAD)
        .order_by(Order.updated_at.desc())
        .limit(200)
        .all()
    )
    return orders


@app.post("/dlq/retry-all")
def retry_all_dlq(db: Session = Depends(get_db)):
    dead = db.query(Order).filter(Order.status == OrderStatus.DEAD).all()
    count = 0
    for order in dead:
        order.status = OrderStatus.QUEUED
        order.retry_count = 0
        order.error_msg = None
        order.updated_at = datetime.utcnow()
        _redis.rpush("orders:queue", json.dumps({"order_id": order.id, "retry_count": 0}))
        count += 1
    db.commit()
    _redis.delete("orders:dlq")
    return {"retried": count}


@app.post("/dlq/{order_id}/retry", response_model=OrderResponse)
def retry_dlq_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != OrderStatus.DEAD:
        raise HTTPException(status_code=400, detail="Only DEAD orders can be retried from the DLQ")
    for raw in _redis.lrange("orders:dlq", 0, -1):
        try:
            entry = json.loads(raw)
            if entry.get("order_id") == order_id:
                _redis.lrem("orders:dlq", 1, raw)
                break
        except Exception:
            pass
    order.status = OrderStatus.QUEUED
    order.retry_count = 0
    order.error_msg = None
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    _redis.rpush("orders:queue", json.dumps({"order_id": order_id, "retry_count": 0}))
    return order


@app.delete("/dlq/{order_id}", status_code=204)
def dismiss_dlq_order(order_id: str, db: Session = Depends(get_db)):
    for raw in _redis.lrange("orders:dlq", 0, -1):
        try:
            entry = json.loads(raw)
            if entry.get("order_id") == order_id:
                _redis.lrem("orders:dlq", 1, raw)
                break
        except Exception:
            pass


_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@app.post("/analytics/run")
def run_analytics() -> Dict[str, Any]:
    """
    Export orders → parquet, then run analytics.
    Tries PySpark first; falls back to the pandas implementation if
    Java is not installed or PySpark is not available.
    Returns the engine that was used so the UI can display it.
    """
    try:
        import pandas  # noqa: F401
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="pandas not installed. Run: pip install pandas pyarrow",
        )

    sys.path.insert(0, _ROOT)

    try:
        from analytics.export_orders import export_to_parquet
        n = export_to_parquet()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {type(exc).__name__}: {exc}")

    # ── Attempt PySpark (requires Java) ──────────────────────────────────────
    spark_script = os.path.join(_ROOT, "analytics", "spark_batch.py")
    spark_ok = False
    try:
        proc = subprocess.run(
            [sys.executable, spark_script],
            capture_output=True,
            text=True,
            timeout=180,
            cwd=_ROOT,
        )
        spark_ok = proc.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        spark_ok = False

    if spark_ok:
        return {"orders_processed": n, "engine": "spark", "status": "ok"}

    # ── Pandas fallback ───────────────────────────────────────────────────────
    try:
        from analytics.pandas_batch import run as pandas_run
        pandas_run()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analytics failed: {type(exc).__name__}: {exc}")

    return {"orders_processed": n, "engine": "pandas", "status": "ok"}


@app.get("/analytics/summary")
def analytics_summary() -> Dict[str, Any]:
    """Return pre-computed analytics (written by PySpark batch job)."""
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=503, detail="pandas not installed")

    _local = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
    base = os.path.join(_local, "orderflow", "analytics")
    out: Dict[str, Any] = {}
    for name in ("hourly", "by_item", "retry_dist", "proc_stats"):
        path = os.path.join(base, f"{name}.parquet")
        if os.path.exists(path):
            df = pd.read_parquet(path)
            # Convert timestamps to ISO strings so JSON serialises cleanly
            for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
                df[col] = df[col].dt.strftime("%Y-%m-%dT%H:%M:%S")
            out[name] = df.fillna(0).to_dict(orient="records")
    return out


@app.get("/analytics/streaming")
def analytics_streaming() -> Dict[str, Any]:
    """Return Spark Structured Streaming window results (if available)."""
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=503, detail="pandas not installed")

    path = os.path.join(_ROOT, "data", "streaming")
    if not os.path.exists(path):
        return {"available": False, "windows": []}

    try:
        df = pd.read_parquet(path)
        for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
            df[col] = df[col].dt.strftime("%Y-%m-%dT%H:%M:%S")
        return {"available": True, "windows": df.fillna(0).to_dict(orient="records")}
    except Exception:
        return {"available": False, "windows": []}


@app.get("/metrics", response_model=MetricsResponse)
def get_metrics(db: Session = Depends(get_db)):
    counts = db.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
    by_status = {s: c for s, c in counts}
    now = _time.time()
    active_workers = _redis.zrangebyscore("workers:active", now - 30, "+inf")
    return MetricsResponse(
        queue_depth=_redis.llen("orders:queue"),
        dlq_depth=_redis.llen("orders:dlq"),
        total_completed=by_status.get(OrderStatus.COMPLETED, 0),
        total_failed=by_status.get(OrderStatus.FAILED, 0),
        total_dead=by_status.get(OrderStatus.DEAD, 0),
        total_processing=by_status.get(OrderStatus.PROCESSING, 0),
        worker_count=len(active_workers),
    )


@app.get("/metrics/history")
def metrics_history():
    """Ring buffer of last ~7.5 min of metric snapshots (3 s intervals)."""
    return list(_metrics_history)


# ═══════════════════════════════════════════════════════════════════════════════
# MRP Routes
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/mrp/materials")
def list_materials(db: Session = Depends(get_db)):
    mats = db.query(Material).order_by(Material.number).all()
    result = []
    for m in mats:
        stock = db.query(MaterialStock).filter(MaterialStock.material_id == m.id).first()
        result.append({
            "id": m.id,
            "number": m.number,
            "description": m.description,
            "mrp_type": m.mrp_type.value,
            "lot_sizing_key": m.lot_sizing_key.value,
            "lead_time_days": m.lead_time_days,
            "safety_stock": m.safety_stock,
            "reorder_point": m.reorder_point,
            "unit_price": m.unit_price,
            "unit_of_measure": m.unit_of_measure,
            "on_hand": stock.quantity_on_hand if stock else 0.0,
        })
    return result


@app.get("/mrp/requirements")
def list_requirements(db: Session = Depends(get_db)):
    reqs = db.query(Requirement).filter(Requirement.is_cancelled == False).order_by(Requirement.requirement_date).all()  # noqa: E712
    result = []
    for r in reqs:
        mat = db.query(Material).filter(Material.id == r.material_id).first()
        result.append({
            "id": r.id,
            "material_id": r.material_id,
            "material_number": mat.number if mat else "?",
            "material_description": mat.description if mat else "?",
            "quantity": r.quantity,
            "requirement_date": r.requirement_date.isoformat(),
            "source": r.source,
            "is_cancelled": r.is_cancelled,
        })
    return result


@app.post("/mrp/requirements", status_code=201)
def create_requirement(payload: dict, db: Session = Depends(get_db)):
    mat = db.query(Material).filter(Material.id == payload["material_id"]).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    r = Requirement(
        material_id=payload["material_id"],
        quantity=float(payload["quantity"]),
        requirement_date=datetime.fromisoformat(payload["requirement_date"]),
        source=payload.get("source", "MANUAL"),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id, "material_id": r.material_id, "quantity": r.quantity,
            "requirement_date": r.requirement_date.isoformat()}


def _run_mrp_background(run_id: str) -> None:
    """Run MRP engine in a background thread (same process, same DB)."""
    import threading
    import json as _json
    db = SessionLocal()
    try:
        def log(level: str, message: str, payload: dict, material_id=None):
            entry = MRPLog(
                run_id=run_id, level=MRPLogLevel(level),
                message=message, payload=_json.dumps(payload),
                material_id=material_id,
            )
            db.add(entry)
            db.flush()

        sys.path.insert(0, _ROOT)
        from mrp.engine import run_full_mrp
        summary = run_full_mrp(run_id, db, log)

        run = db.query(MRPRun).filter(MRPRun.id == run_id).first()
        if run:
            run.status = "COMPLETED"
            run.materials_planned = summary["materials_planned"]
            run.planned_orders_created = summary["planned_orders_created"]
            run.exception_count = summary["exception_count"]
            run.completed_at = datetime.utcnow()
            db.commit()
    except Exception as exc:
        db.rollback()
        try:
            run = db.query(MRPRun).filter(MRPRun.id == run_id).first()
            if run:
                db.add(MRPLog(
                    run_id=run_id, level=MRPLogLevel.ERROR,
                    message=f"Run failed: {exc}", payload="{}",
                ))
                run.status = "FAILED"
                run.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@app.post("/mrp/run", status_code=201)
def trigger_mrp_run(db: Session = Depends(get_db)):
    import threading
    run = MRPRun(id=str(uuid.uuid4()), triggered_by="API", status="RUNNING")
    db.add(run)
    db.commit()
    threading.Thread(target=_run_mrp_background, args=(run.id,), daemon=True).start()
    return {"run_id": run.id, "status": "RUNNING", "started_at": run.started_at.isoformat()}


@app.get("/mrp/runs")
def list_mrp_runs(db: Session = Depends(get_db)):
    runs = db.query(MRPRun).order_by(MRPRun.started_at.desc()).limit(20).all()
    return [
        {
            "id": r.id,
            "status": r.status,
            "materials_planned": r.materials_planned,
            "planned_orders_created": r.planned_orders_created,
            "exception_count": r.exception_count,
            "started_at": r.started_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@app.get("/mrp/runs/{run_id}")
def get_mrp_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(MRPRun).filter(MRPRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    pos = db.query(PlannedOrder).filter(PlannedOrder.run_id == run_id).all()
    exceptions = db.query(ExceptionMessage).filter(ExceptionMessage.run_id == run_id).all()
    return {
        "id": run.id,
        "status": run.status,
        "materials_planned": run.materials_planned,
        "planned_orders_created": run.planned_orders_created,
        "exception_count": run.exception_count,
        "started_at": run.started_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "planned_orders": [
            {
                "id": p.id,
                "material_id": p.material_id,
                "quantity": p.quantity,
                "planned_start": p.planned_start.isoformat(),
                "planned_finish": p.planned_finish.isoformat(),
                "requirement_date": p.requirement_date.isoformat(),
                "lot_sizing_key": p.lot_sizing_key,
                "exception_codes": json.loads(p.exception_codes),
                "order_type": p.order_type,
            }
            for p in pos
        ],
        "exception_messages": [
            {
                "id": ex.id,
                "material_id": ex.material_id,
                "code": ex.code,
                "description": ex.description,
                "planned_order_id": ex.planned_order_id,
            }
            for ex in exceptions
        ],
    }


@app.get("/mrp/runs/{run_id}/logs")
def get_mrp_logs(run_id: str, after_id: int = 0, db: Session = Depends(get_db)):
    logs = (
        db.query(MRPLog)
        .filter(MRPLog.run_id == run_id, MRPLog.id > after_id)
        .order_by(MRPLog.id)
        .limit(500)
        .all()
    )
    return [
        {
            "id": log.id,
            "level": log.level.value,
            "message": log.message,
            "payload": json.loads(log.payload),
            "material_id": log.material_id,
            "ts": log.ts.isoformat(),
        }
        for log in logs
    ]


@app.get("/mrp/runs/{run_id}/stream")
async def stream_mrp_logs(run_id: str):
    """SSE endpoint — streams MRP logs in real-time as the worker processes the run."""

    async def generate():
        last_id = 0
        consecutive_done = 0
        for _ in range(600):  # 3 min max at 300ms polling
            db = SessionLocal()
            try:
                run = db.query(MRPRun).filter(MRPRun.id == run_id).first()
                if not run:
                    yield f"data: {json.dumps({'error': 'run not found'})}\n\n"
                    return

                logs = (
                    db.query(MRPLog)
                    .filter(MRPLog.run_id == run_id, MRPLog.id > last_id)
                    .order_by(MRPLog.id)
                    .limit(100)
                    .all()
                )
                for log in logs:
                    event = {
                        "id": log.id,
                        "level": log.level.value,
                        "message": log.message,
                        "payload": json.loads(log.payload),
                        "material_id": log.material_id,
                        "ts": log.ts.isoformat(),
                    }
                    yield f"data: {json.dumps(event)}\n\n"
                    last_id = log.id

                if run.status in ("COMPLETED", "FAILED"):
                    consecutive_done += 1
                    if consecutive_done >= 2:  # emit after flush
                        yield f"data: {json.dumps({'_done': True, 'status': run.status})}\n\n"
                        return
                else:
                    consecutive_done = 0
            finally:
                db.close()

            await asyncio.sleep(0.3)

        yield f"data: {json.dumps({'_timeout': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/mrp/planned-orders")
def list_planned_orders(run_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(PlannedOrder)
    if run_id:
        q = q.filter(PlannedOrder.run_id == run_id)
    pos = q.order_by(PlannedOrder.created_at.desc()).limit(200).all()
    result = []
    for p in pos:
        mat = db.query(Material).filter(Material.id == p.material_id).first()
        result.append({
            "id": p.id,
            "run_id": p.run_id,
            "material_id": p.material_id,
            "material_number": mat.number if mat else "?",
            "material_description": mat.description if mat else "?",
            "quantity": p.quantity,
            "unit_of_measure": mat.unit_of_measure if mat else "EA",
            "planned_start": p.planned_start.isoformat(),
            "planned_finish": p.planned_finish.isoformat(),
            "requirement_date": p.requirement_date.isoformat(),
            "lot_sizing_key": p.lot_sizing_key,
            "exception_codes": json.loads(p.exception_codes),
            "order_type": p.order_type,
        })
    return result


@app.post("/mrp/seed")
def seed_mrp_data():
    """Seed demo MRP master data (materials, stock, requirements)."""
    import sys as _sys
    _sys.path.insert(0, _ROOT)
    from mrp.seed import seed
    seed()
    return {"status": "seeded"}


@app.get("/mrp/bom")
def list_bom(db: Session = Depends(get_db)):
    """All active BOM items with parent and component material details."""
    items = db.query(BOMItem).filter(BOMItem.is_active == True).all()  # noqa: E712
    result = []
    for bi in items:
        parent = db.query(Material).filter(Material.id == bi.parent_material_id).first()
        comp = db.query(Material).filter(Material.id == bi.component_material_id).first()
        stock = db.query(MaterialStock).filter(MaterialStock.material_id == bi.component_material_id).first() if comp else None
        result.append({
            "id": bi.id,
            "parent_material_id": bi.parent_material_id,
            "parent_number": parent.number if parent else "?",
            "parent_description": parent.description if parent else "?",
            "component_material_id": bi.component_material_id,
            "component_number": comp.number if comp else "?",
            "component_description": comp.description if comp else "?",
            "component_uom": comp.unit_of_measure if comp else "EA",
            "component_mrp_type": comp.mrp_type.value if comp else None,
            "component_lead_time": comp.lead_time_days if comp else None,
            "component_on_hand": stock.quantity_on_hand if stock else 0.0,
            "quantity_per": bi.quantity_per,
            "is_active": bi.is_active,
        })
    return result


@app.get("/mrp/bom/{material_number}")
def get_bom(material_number: str, db: Session = Depends(get_db)):
    """BOM for a specific parent material (its direct components)."""
    mat = db.query(Material).filter(Material.number == material_number).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    items = db.query(BOMItem).filter(
        BOMItem.parent_material_id == mat.id,
        BOMItem.is_active == True,  # noqa: E712
    ).all()
    result = []
    for bi in items:
        comp = db.query(Material).filter(Material.id == bi.component_material_id).first()
        stock = db.query(MaterialStock).filter(MaterialStock.material_id == bi.component_material_id).first()
        result.append({
            "id": bi.id,
            "component_material_id": bi.component_material_id,
            "component_number": comp.number if comp else "?",
            "component_description": comp.description if comp else "?",
            "component_uom": comp.unit_of_measure if comp else "EA",
            "component_mrp_type": comp.mrp_type.value if comp else "?",
            "component_lead_time": comp.lead_time_days if comp else 0,
            "component_on_hand": stock.quantity_on_hand if stock else 0.0,
            "quantity_per": bi.quantity_per,
        })
    return {
        "material_number": mat.number,
        "material_description": mat.description,
        "components": result,
    }


@app.get("/mrp/where-used/{material_number}")
def where_used(material_number: str, db: Session = Depends(get_db)):
    """Which parent assemblies use this material as a component."""
    mat = db.query(Material).filter(Material.number == material_number).first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    items = db.query(BOMItem).filter(
        BOMItem.component_material_id == mat.id,
        BOMItem.is_active == True,  # noqa: E712
    ).all()
    result = []
    for bi in items:
        parent = db.query(Material).filter(Material.id == bi.parent_material_id).first()
        result.append({
            "id": bi.id,
            "parent_material_id": bi.parent_material_id,
            "parent_number": parent.number if parent else "?",
            "parent_description": parent.description if parent else "?",
            "quantity_per": bi.quantity_per,
        })
    return {
        "material_number": mat.number,
        "material_description": mat.description,
        "used_in": result,
    }
