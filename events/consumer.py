"""
Kafka consumer: persists all order events to the order_events audit table.
Run: python -m events.consumer  (from orderflow/ directory)
"""
import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [consumer] %(message)s")
logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPICS = ["order.created", "order.processing", "order.completed", "order.failed", "order.dead"]


def main():
    from kafka import KafkaConsumer

    from api.database import SessionLocal
    from api.models import OrderEvent

    consumer = KafkaConsumer(
        *TOPICS,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id="orderflow-audit-consumer",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        key_deserializer=lambda k: k.decode("utf-8") if k else None,
        auto_offset_reset="earliest",
        enable_auto_commit=True,
    )

    logger.info("Listening on topics: %s", TOPICS)

    for msg in consumer:
        db = SessionLocal()
        try:
            event = OrderEvent(
                order_id=msg.key or "unknown",
                topic=msg.topic,
                payload=json.dumps(msg.value),
                ts=datetime.utcnow(),
            )
            db.add(event)
            db.commit()
            logger.info("%s → order %s", msg.topic, msg.key)
        except Exception as exc:
            logger.error("Failed to persist event: %s", exc)
            db.rollback()
        finally:
            db.close()


if __name__ == "__main__":
    main()
