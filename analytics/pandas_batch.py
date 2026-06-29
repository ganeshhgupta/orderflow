"""
Pandas fallback for spark_batch.py — same computations, no JVM required.
Automatically used by the API when Java / PySpark is not available.
The PySpark implementation in spark_batch.py is the primary; this exists
so the analytics page works in local-demo mode without Docker/Java.
"""
import os

import pandas as pd

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT  = os.path.join(ROOT, "data", "orders.parquet")
# Use LOCALAPPDATA to stay off OneDrive, which locks parquet files during sync.
_LOCAL = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
OUTPUT = os.path.join(_LOCAL, "orderflow", "analytics")


def run() -> dict:
    df = pd.read_parquet(INPUT)
    n  = len(df)
    os.makedirs(OUTPUT, exist_ok=True)

    df["created_at"]   = pd.to_datetime(df["created_at"],   errors="coerce")
    df["processed_at"] = pd.to_datetime(df["processed_at"], errors="coerce")

    # ── 1. Hourly throughput ──────────────────────────────────────────────────
    df["hour"] = df["created_at"].dt.floor("h")
    hourly = (
        df.groupby("hour")
        .agg(
            total      = ("id",     "count"),
            completed  = ("status", lambda x: (x == "COMPLETED").sum()),
            failed     = ("status", lambda x: x.isin(["FAILED", "DEAD"]).sum()),
        )
        .reset_index()
        .sort_values("hour")
    )
    hourly["hour"] = hourly["hour"].dt.strftime("%Y-%m-%dT%H:%M:%S")
    hourly.to_parquet(os.path.join(OUTPUT, "hourly.parquet"), index=False)

    # ── 2. Failure rate + avg retries per item ────────────────────────────────
    by_item = (
        df.groupby("item")
        .agg(
            total       = ("id",          "count"),
            completed   = ("status",      lambda x: (x == "COMPLETED").sum()),
            failed      = ("status",      lambda x: x.isin(["FAILED", "DEAD"]).sum()),
            avg_retries = ("retry_count", "mean"),
            avg_price   = ("price",       "mean"),
        )
        .reset_index()
    )
    by_item["avg_retries"] = by_item["avg_retries"].round(2)
    by_item["avg_price"]   = by_item["avg_price"].round(2)
    by_item["failure_pct"] = (by_item["failed"] / by_item["total"] * 100).round(1)
    by_item = by_item.sort_values("failure_pct", ascending=False)
    by_item.to_parquet(os.path.join(OUTPUT, "by_item.parquet"), index=False)

    # ── 3. Retry distribution ─────────────────────────────────────────────────
    retry_dist = (
        df.groupby("retry_count")
        .size()
        .reset_index(name="count")
        .sort_values("retry_count")
    )
    retry_dist.to_parquet(os.path.join(OUTPUT, "retry_dist.parquet"), index=False)

    # ── 4. Processing latency (completed orders only) ─────────────────────────
    comp = df[(df["status"] == "COMPLETED") & df["processed_at"].notna()].copy()
    if len(comp) > 0:
        comp["proc_seconds"] = (
            comp["processed_at"] - comp["created_at"]
        ).dt.total_seconds()
        proc_stats = pd.DataFrame([{
            "avg_s": round(float(comp["proc_seconds"].mean()), 3),
            "min_s": float(comp["proc_seconds"].min()),
            "max_s": float(comp["proc_seconds"].max()),
            "p50_s": round(float(comp["proc_seconds"].quantile(0.50)), 3),
            "p95_s": round(float(comp["proc_seconds"].quantile(0.95)), 3),
            "n":     int(len(comp)),
        }])
        proc_stats.to_parquet(os.path.join(OUTPUT, "proc_stats.parquet"), index=False)

    return {"orders_processed": n}


if __name__ == "__main__":
    result = run()
    print(f"[pandas_batch] complete — {result['orders_processed']} orders → {OUTPUT}")
