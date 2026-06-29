# events/producer.py
import json
import logging
import os
import time
import uuid as _uuid
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_ENABLED = os.getenv("KAFKA_ENABLED", "true").lower() == "true"

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STREAM_INBOX = os.path.join(_ROOT, "data", "stream_inbox")

_producer = None


def _get_kafka_producer():
    global _producer
    if _producer is not None:
        return _producer
    try:
        from kafka import KafkaProducer

        _producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            request_timeout_ms=5000,
            api_version_auto_timeout_ms=3000,
        )
        logger.info("Kafka producer connected to %s", KAFKA_BOOTSTRAP)
        return _producer
    except Exception as exc:
        logger.debug("Kafka unavailable (%s) — using in-process bus", exc)
        return None


def _persist_event(topic: str, key: str, payload: dict) -> None:
    """Persist event directly to SQLite order_events table."""
    try:
        from api.database import SessionLocal
        from api.models import OrderEvent
        db = SessionLocal()
        try:
            ev = OrderEvent(
                order_id=key,
                topic=topic,
                payload=json.dumps(payload),
                ts=datetime.utcnow(),
            )
            db.add(ev)
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        logger.debug("Event persistence failed: %s", exc)


def _write_stream(topic: str, key: str, payload: dict) -> None:
    """Write event to file inbox for Spark streaming."""
    try:
        os.makedirs(STREAM_INBOX, exist_ok=True)
        entry = {
            "topic": topic,
            "order_id": key,
            "event_time": datetime.utcnow().isoformat(),
            **payload,
        }
        fname = f"{topic.replace('.', '_')}_{int(time.time() * 1000)}_{_uuid.uuid4().hex[:6]}.json"
        with open(os.path.join(STREAM_INBOX, fname), "w") as f:
            json.dump(entry, f)
    except Exception as exc:
        logger.debug("Stream inbox write failed: %s", exc)


def publish(topic: str, key: str, payload: dict) -> None:
    # 1. Fan out to all in-process SSE subscribers (zero-latency)
    try:
        from events.bus import broker
        broker.publish(topic, key, payload)
    except Exception as exc:
        logger.debug("In-process bus publish failed: %s", exc)

    # 2. Persist to SQLite so events survive restarts and are queryable
    _persist_event(topic, key, payload)

    # 3. Write to file stream inbox for Spark
    _write_stream(topic, key, payload)

    # 4. Try real Kafka if configured
    if not KAFKA_ENABLED:
        return
    producer = _get_kafka_producer()
    if producer is None:
        return
    try:
        producer.send(topic, key=key, value=payload)
        producer.flush(timeout=3)
    except Exception as exc:
        logger.warning("Failed to publish to Kafka %s: %s", topic, exc)
