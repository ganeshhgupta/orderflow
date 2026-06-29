# seed_data.py — insert 500 orders with realistic variation for demo purposes
import random
import sqlite3
import uuid
from datetime import datetime, timedelta

DB_PATH = "orderflow.db"

ITEMS = [
    ("Laptop",          35.0, 0.12),   # (name, base_price_multiplier_range_max, failure_rate)
    ("Mechanical Keyboard", 8.9, 0.07),
    ("4K Monitor",      42.0, 0.18),
    ("Webcam",           7.5, 0.05),
    ("USB-C Hub",        2.8, 0.22),
    ("SSD",             12.0, 0.09),
    ("RAM Kit",          8.0, 0.15),
    ("GPU",             85.0, 0.25),
    ("Headphones",      15.0, 0.06),
    ("Docking Station", 22.0, 0.20),
    ("Router",          11.0, 0.14),
    ("Microphone",      19.0, 0.08),
    ("Mouse",            4.5, 0.04),
    ("Speaker",         13.0, 0.11),
    ("Thunderbolt Hub", 28.0, 0.30),
]

STATUSES = ["COMPLETED", "FAILED", "DEAD"]

def random_ts(base: datetime, spread_hours: int) -> datetime:
    return base - timedelta(
        hours=random.randint(0, spread_hours),
        minutes=random.randint(0, 59),
        seconds=random.randint(0, 59),
    )

def make_order(base_time: datetime):
    item_name, price_max, fail_rate = random.choice(ITEMS)
    price = round(random.uniform(price_max * 0.5, price_max * 1.5) * random.randint(1, 5), 2)
    qty   = random.randint(1, 10)

    r = random.random()
    if r < fail_rate * 0.6:
        status = "DEAD"
        retries = 3
    elif r < fail_rate:
        status = "FAILED"
        retries = random.randint(1, 3)
    else:
        status = "COMPLETED"
        retries = random.choices([0, 1, 2], weights=[0.70, 0.22, 0.08])[0]

    created_at   = random_ts(base_time, spread_hours=720)
    proc_seconds = random.uniform(0.5, 15.0) if status == "COMPLETED" else None
    processed_at = (created_at + timedelta(seconds=proc_seconds)) if proc_seconds else None

    error_msg = None
    if status in ("FAILED", "DEAD"):
        error_msg = random.choice([
            "timeout after 30s",
            "downstream service unavailable",
            "invalid payment method",
            "inventory check failed",
            "rate limit exceeded",
        ])

    return (
        str(uuid.uuid4()),
        item_name,
        qty,
        price,
        status,
        retries,
        error_msg,
        created_at.strftime("%Y-%m-%d %H:%M:%S"),
        (processed_at.strftime("%Y-%m-%d %H:%M:%S") if processed_at else None),
    )


def run(n: int = 500):
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    base_time = datetime.utcnow()
    rows = [make_order(base_time) for _ in range(n)]

    cur.executemany(
        """INSERT INTO orders
           (id, item, quantity, price, status, retry_count, error_msg, created_at, processed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )
    conn.commit()
    conn.close()

    counts = {}
    for r in rows:
        counts[r[4]] = counts.get(r[4], 0) + 1
    print(f"Inserted {n} orders:")
    for s, c in sorted(counts.items()):
        print(f"  {s:12s} {c}")


if __name__ == "__main__":
    run(5000)
