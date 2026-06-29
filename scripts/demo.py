#!/usr/bin/env python3
"""
Demo: submit 10 orders and poll status until all reach a terminal state.
Usage: python scripts/demo.py
"""
import random
import time

import httpx

BASE_URL = "http://localhost:8000"

SAMPLE_ORDERS = [
    {"item": "Laptop", "quantity": 1, "price": 1299.99},
    {"item": "Headphones", "quantity": 2, "price": 89.99},
    {"item": "Mechanical Keyboard", "quantity": 1, "price": 149.99},
    {"item": "4K Monitor", "quantity": 1, "price": 449.99},
    {"item": "NVMe SSD 1TB", "quantity": 3, "price": 79.99},
    {"item": "USB-C Hub", "quantity": 2, "price": 49.99},
    {"item": "Webcam 4K", "quantity": 1, "price": 129.99},
    {"item": "Gaming Mouse", "quantity": 1, "price": 69.99},
    {"item": "32GB RAM Kit", "quantity": 1, "price": 119.99},
    {"item": "Docking Station", "quantity": 1, "price": 199.99},
]

STATUS_ICON = {
    "PENDING": "⏳",
    "QUEUED": "📋",
    "PROCESSING": "⚙️ ",
    "COMPLETED": "✅",
    "FAILED": "⚠️ ",
    "DEAD": "💀",
}
TERMINAL = {"COMPLETED", "DEAD"}


def clear():
    print("\033[H\033[J", end="")


def main():
    print(f"Submitting 10 orders to {BASE_URL}...\n")
    order_ids = []

    with httpx.Client(timeout=15.0) as client:
        try:
            client.get(f"{BASE_URL}/health").raise_for_status()
        except Exception:
            print(f"ERROR: API not reachable at {BASE_URL}")
            print("Make sure to run: uvicorn api.main:app --reload")
            return

        for data in SAMPLE_ORDERS:
            resp = client.post(f"{BASE_URL}/orders", json=data)
            resp.raise_for_status()
            order = resp.json()
            order_ids.append(order["id"])
            print(f"  {STATUS_ICON.get(order['status'], '?')} {order['item']:25s} {order['id'][:8]}...")

        print(f"\nPolling status every 2s (Ctrl+C to stop)...\n")
        time.sleep(1)

        while True:
            orders = {}
            for oid in order_ids:
                resp = client.get(f"{BASE_URL}/orders/{oid}")
                orders[oid] = resp.json()

            metrics_resp = client.get(f"{BASE_URL}/metrics")
            metrics = metrics_resp.json()

            clear()
            print(f"  {'Item':25s}  {'Status':12s}  {'Retries':8s}  {'ID':10s}")
            print("  " + "-" * 62)
            for oid in order_ids:
                o = orders[oid]
                icon = STATUS_ICON.get(o["status"], "?")
                print(f"  {o['item']:25s}  {icon} {o['status']:10s}  {o['retry_count']:8d}  {oid[:8]}...")

            print(f"\n  Queue: {metrics['queue_depth']}  |  "
                  f"Processing: {metrics['total_processing']}  |  "
                  f"Completed: {metrics['total_completed']}  |  "
                  f"Dead: {metrics['total_dead']}")

            all_done = all(o["status"] in TERMINAL for o in orders.values())
            if all_done:
                completed = sum(1 for o in orders.values() if o["status"] == "COMPLETED")
                dead = sum(1 for o in orders.values() if o["status"] == "DEAD")
                print(f"\n  All done! {completed} completed, {dead} dead-lettered.")
                break

            time.sleep(2)


if __name__ == "__main__":
    main()
