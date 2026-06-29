"""
Export orders from SQLite to Parquet so PySpark can read them.
Called by api/main.py before running the batch job.
"""
import os
import sqlite3
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def export_to_parquet(out_path: str | None = None) -> int:
    if out_path is None:
        out_path = os.path.join(ROOT, "data", "orders.parquet")

    db_path = os.path.join(ROOT, "orderflow.db")
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found: {db_path}")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    df = pd.read_sql("SELECT * FROM orders", conn)
    conn.close()

    for col in ("created_at", "updated_at", "processed_at"):
        df[col] = pd.to_datetime(df[col], format="mixed", errors="coerce")

    df.to_parquet(out_path, index=False)
    return len(df)


if __name__ == "__main__":
    n = export_to_parquet()
    print(f"Exported {n} orders → data/orders.parquet")
