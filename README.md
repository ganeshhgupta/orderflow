# OrderFlow

Distributed order processing system with event-driven architecture.

## Architecture

```
Client
  │  POST /orders
  ▼
FastAPI ──────────────────► fakeredis RPUSH → orders:queue
  │  GET /orders/{id}               │
  │  GET /metrics                   ▼
  │                        Worker Pool (dynamic threads)
  │                          BLPOP · process · retry
  │                                 │
  │                        events/producer.py
  │                          writes JSON → data/stream_inbox/
  │                                 │
  └────────────────────────► SQLite (orders.db)
                               orders (source of truth)

Analytics (optional, requires Java 21 + PySpark 3.5):
  data/stream_inbox/ → spark_streaming.py → data/streaming/
  orders.db          → spark_batch.py     → data/analytics/
```

**Stack**: Python 3.11 · FastAPI · fakeredis · SQLite · SQLAlchemy · PySpark 3.5

No Docker, no Kafka, no PostgreSQL required — runs fully in-process.

## Features

| Feature | Details |
|---------|---------|
| Distributed queue | fakeredis RPUSH/BLPOP; dynamic worker pool |
| Retry + backoff | Exponential: 1s → 2s → 4s; max 3 attempts |
| Failed orders | Permanently failed orders → `orders:dlq` list + `DEAD` status |
| Event stream | Workers write JSON files to `data/stream_inbox/` per event |
| Live metrics | Worker count via Redis sorted-set heartbeat; auto-refreshes |
| REST API | Submit, poll, filter orders; live metrics endpoint |
| PySpark analytics | Batch (hourly/item/retry/latency) + structured streaming |
| React dashboard | Order list, metrics sidebar, analytics charts, failed orders page |

## Quick Start

```bash
# 1. Install dependencies (no infrastructure needed)
pip install -r requirements.txt

# 2. Seed the database with sample orders
python seed_data.py

# 3. Start API (terminal 1)
uvicorn api.main:app --reload

# 4. Start workers (terminal 2)
python -m worker.worker

# 5. Start frontend (terminal 3)
cd frontend && npm start
```

## Analytics (PySpark)

Requires Java 21 and PySpark 3.5. Both are pre-configured if you're on the dev machine.

```bash
# Batch analytics (reads SQLite, writes data/analytics/)
python analytics/spark_batch.py

# Structured streaming (reads data/stream_inbox/, writes data/streaming/)
python analytics/spark_streaming.py
```

Or click "Run Analysis" in the dashboard — it auto-selects Spark if available, falls back to pandas.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orders` | Submit order `{item, quantity, price}` |
| `GET` | `/orders` | List orders; filter with `?status=PROCESSING` |
| `GET` | `/orders/{id}` | Poll order status |
| `GET` | `/orders/{id}/events` | Full event history for an order |
| `GET` | `/metrics` | Queue depth, failed orders depth, status counts, worker count |
| `POST` | `/analytics/run` | Run batch analytics (Spark or pandas) |
| `GET` | `/analytics/summary` | Return pre-computed analytics results |
| `GET` | `/analytics/streaming` | Return streaming window results |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/health` | Health check |

## Order Status Flow

```
PENDING -> QUEUED -> PROCESSING -> COMPLETED
                               \-> FAILED (retrying) -> ... -> DEAD
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./orders.db` | SQLAlchemy DB URL |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis (falls back to fakeredis) |
| `KAFKA_ENABLED` | `false` | Enable Kafka event publishing |
| `WORKER_COUNT` | `3` | Initial worker thread count |
