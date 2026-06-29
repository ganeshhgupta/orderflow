"""
Distributed worker pool: BLPOP from Redis, process orders, publish Kafka events.
Run standalone: python -m worker.worker  (from orderflow/ directory)
Or import worker_loop for use in run.py combined launcher.
"""
import json
import logging
import os
import random
import sys
import threading
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(message)s")
logger = logging.getLogger("worker")

MAX_RETRIES = 3
FAILURE_RATE = 0.15

import redis_client as _rc

_redis = _rc._redis


def _db_session():
    from api.database import SessionLocal
    return SessionLocal()


def _update_order(db, order_id: str, **kwargs):
    from api.models import Order

    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise LookupError(f"Order {order_id} not found")
    for k, v in kwargs.items():
        setattr(order, k, v)
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    return order


def process_order(order_id: str, retry_count: int, worker_id: str) -> None:
    from api.models import Order, OrderStatus
    from events.producer import publish

    db = _db_session()
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if order is None:
            logger.warning("%s] Order %s not found, skipping", worker_id, order_id)
            return

        _update_order(db, order_id, status=OrderStatus.PROCESSING, retry_count=retry_count)
        publish("order.processing", order_id,
                {"order_id": order_id, "item": order.item, "worker_id": worker_id,
                 "attempt": retry_count + 1, "ts": datetime.utcnow().isoformat()})

        processing_time = random.uniform(0.8, 2.5)
        time.sleep(processing_time)

        if random.random() < FAILURE_RATE:
            raise RuntimeError(f"Simulated processing failure (attempt {retry_count + 1})")

        _update_order(db, order_id,
                      status=OrderStatus.COMPLETED,
                      processed_at=datetime.utcnow(),
                      error_msg=None)
        publish("order.completed", order_id,
                {"order_id": order_id, "item": order.item,
                 "processing_ms": int(processing_time * 1000),
                 "ts": datetime.utcnow().isoformat()})
        logger.info("%s] COMPLETED %s (%.2fs)", worker_id, order_id[:8], processing_time)

    except Exception as exc:
        db.rollback()
        from api.models import OrderStatus
        from events.producer import publish

        if retry_count + 1 >= MAX_RETRIES:
            try:
                _update_order(db, order_id, status=OrderStatus.DEAD, error_msg=str(exc))
            except Exception as inner:
                logger.error("%s] Could not mark DEAD: %s", worker_id, inner)
                db.rollback()
                return

            _redis.rpush("orders:dlq", json.dumps({"order_id": order_id, "error": str(exc)}))
            publish("order.dead", order_id,
                    {"order_id": order_id, "error": str(exc),
                     "attempts": retry_count + 1, "ts": datetime.utcnow().isoformat()})
            logger.warning("%s] DEAD %s after %d attempts: %s", worker_id, order_id[:8], retry_count + 1, exc)
        else:
            backoff = 2 ** retry_count
            try:
                _update_order(db, order_id, status=OrderStatus.FAILED,
                              error_msg=str(exc), retry_count=retry_count)
            except Exception as inner:
                logger.error("%s] Could not mark FAILED: %s", worker_id, inner)
                db.rollback()
                return

            publish("order.failed", order_id,
                    {"order_id": order_id, "error": str(exc), "attempt": retry_count + 1,
                     "retry_in": backoff, "ts": datetime.utcnow().isoformat()})
            logger.info("%s] FAILED %s, retrying in %ds (attempt %d/%d)",
                        worker_id, order_id[:8], backoff, retry_count + 2, MAX_RETRIES)
            time.sleep(backoff)
            _redis.rpush("orders:queue",
                         json.dumps({"order_id": order_id, "retry_count": retry_count + 1}))
    finally:
        db.close()


def worker_loop(worker_id: str) -> None:
    logger.info("%s] Started, waiting for jobs...", worker_id)
    while True:
        try:
            _redis.zadd("workers:active", {worker_id: time.time()})
            result = _redis.blpop("orders:queue", timeout=5)
            if result is None:
                continue
            _, raw = result
            job = json.loads(raw)
            order_id = job["order_id"]
            retry_count = job.get("retry_count", 0)
            logger.info("%s] Picked up %s (attempt %d)", worker_id, order_id[:8], retry_count + 1)
            process_order(order_id, retry_count, worker_id)
        except KeyboardInterrupt:
            break
        except Exception as exc:
            logger.error("%s] Unexpected error: %s", worker_id, exc)
            time.sleep(1)


def mrp_worker_loop(worker_id: str) -> None:
    logger.info("%s] MRP worker started", worker_id)
    while True:
        try:
            _redis.zadd("workers:active", {worker_id: time.time()})
            result = _redis.blpop("mrp:queue", timeout=5)
            if result is None:
                continue
            _, raw = result
            job = json.loads(raw)
            run_id = job.get("run_id")
            if not run_id:
                continue
            logger.info("%s] MRP job picked up: run %s", worker_id, run_id[:8])
            _run_mrp_job(run_id, worker_id)
        except KeyboardInterrupt:
            break
        except Exception as exc:
            logger.error("%s] MRP worker error: %s", worker_id, exc)
            time.sleep(1)


def _run_mrp_job(run_id: str, worker_id: str) -> None:
    from api.database import SessionLocal
    from api.models import MRPRun, MRPLog, MRPLogLevel

    db = SessionLocal()
    try:
        run = db.query(MRPRun).filter(MRPRun.id == run_id).first()
        if not run:
            logger.error("MRP run %s not found", run_id)
            return

        def log(level: str, message: str, payload: dict, material_id=None):
            entry = MRPLog(
                run_id=run_id,
                level=MRPLogLevel(level),
                message=message,
                payload=json.dumps(payload),
                material_id=material_id,
            )
            db.add(entry)
            db.flush()
            logger.info("MRP [%s] %s", level, message)

        log("INFO", f"Worker {worker_id} picked up run {run_id[:8]}", {"worker": worker_id})

        from mrp.engine import run_full_mrp
        summary = run_full_mrp(run_id, db, log)

        run.status = "COMPLETED"
        run.materials_planned = summary["materials_planned"]
        run.planned_orders_created = summary["planned_orders_created"]
        run.exception_count = summary["exception_count"]
        run.completed_at = datetime.utcnow()
        db.commit()
        logger.info("MRP run %s completed: %s", run_id[:8], summary)

    except Exception as exc:
        db.rollback()
        try:
            run = db.query(MRPRun).filter(MRPRun.id == run_id).first()
            if run:
                from api.models import MRPLog, MRPLogLevel
                db.add(MRPLog(
                    run_id=run_id, level=MRPLogLevel.ERROR,
                    message=f"Run failed: {exc}", payload="{}",
                ))
                run.status = "FAILED"
                run.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
        logger.error("MRP run %s failed: %s", run_id[:8], exc)
    finally:
        db.close()


def main():
    num_workers = int(os.getenv("WORKER_COUNT", "3"))
    threads = []
    for i in range(num_workers):
        t = threading.Thread(target=worker_loop, args=(f"worker-{i + 1}",), daemon=True)
        t.start()
        threads.append(t)
    # One MRP worker thread
    mrp_t = threading.Thread(target=mrp_worker_loop, args=("mrp-worker-1",), daemon=True)
    mrp_t.start()
    threads.append(mrp_t)
    logger.info("main] Started %d order workers + 1 MRP worker (FAILURE_RATE=%.0f%%, MAX_RETRIES=%d)",
                num_workers, FAILURE_RATE * 100, MAX_RETRIES)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("main] Shutting down...")


if __name__ == "__main__":
    main()
