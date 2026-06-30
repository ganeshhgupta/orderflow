"""
Export orders to Parquet so the batch analytics job can read them.
Uses the shared SQLAlchemy engine so it works with SQLite (dev) and Postgres (prod).
"""
import os
import sys

import pandas as pd
from sqlalchemy import text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


def export_to_parquet(out_path: str | None = None) -> int:
    if out_path is None:
        out_path = os.path.join(ROOT, "data", "orders.parquet")

    from api.database import engine

    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with engine.connect() as conn:
        df = pd.read_sql(text("SELECT * FROM orders"), conn)

    for col in ("created_at", "updated_at", "processed_at"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], format="mixed", errors="coerce")

    df.to_parquet(out_path, index=False)
    return len(df)


if __name__ == "__main__":
    n = export_to_parquet()
    print(f"Exported {n} orders → data/orders.parquet")
