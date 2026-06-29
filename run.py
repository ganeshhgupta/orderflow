#!/usr/bin/env python3
"""
Single-process launcher: API + worker pool in one command.
Workers and API share the same process so the in-process event bus works.
Usage: python run.py
Docs:  http://localhost:8000/docs
"""
import os
import sys
import threading

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from worker.worker import worker_loop

num_workers = int(os.getenv("WORKER_COUNT", "3"))
for i in range(num_workers):
    t = threading.Thread(target=worker_loop, args=(f"worker-{i + 1}",), daemon=True)
    t.start()

print(f"\n  OrderFlow started ({num_workers} workers + event bus)")
print("  Swagger UI    ->  http://localhost:8000/docs")
print("  Metrics       ->  http://localhost:8000/metrics")
print("  Event stream  ->  http://localhost:8000/events/stream")
print("  Press Ctrl+C to stop\n")

import uvicorn
port = int(os.getenv("PORT", 8000))
uvicorn.run("api.main:app", host="0.0.0.0", port=port, reload=False, log_level="warning")
