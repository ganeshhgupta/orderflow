#!/usr/bin/env python3
"""
Bulk-seed N orders into the queue to demonstrate load handling.
Usage: python scripts/seed.py [count=100]
"""
import random
import sys

import httpx

BASE_URL = "http://localhost:8000"

ITEMS = [
    "Laptop", "Headphones", "Mechanical Keyboard", "4K Monitor", "Webcam",
    "Wireless Mouse", "USB-C Hub", "NVMe SSD", "32GB RAM Kit", "GPU",
    "Tablet", "Laser Printer", "Wi-Fi 6 Router", "USB Microphone",
    "Bluetooth Speaker", "65W Charger", "Braided Cable", "Phone Case",
    "Monitor Stand", "Docking Station",
]


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    print(f"Submitting {count} orders to {BASE_URL}...")

    success = 0
    with httpx.Client(timeout=30.0) as client:
        for i in range(count):
            data = {
                "item": random.choice(ITEMS),
                "quantity": random.randint(1, 10),
                "price": round(random.uniform(5.0, 2000.0), 2),
            }
            resp = client.post(f"{BASE_URL}/orders", json=data)
            if resp.status_code == 201:
                success += 1
                if (i + 1) % 20 == 0:
                    print(f"  {i + 1}/{count} submitted...")
            else:
                print(f"  [ERROR] {resp.status_code}: {resp.text}")

    print(f"\nDone: {success}/{count} orders queued.")
    print(f"Check metrics: curl {BASE_URL}/metrics")


if __name__ == "__main__":
    main()
