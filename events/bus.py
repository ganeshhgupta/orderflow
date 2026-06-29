# events/bus.py
"""
In-process Kafka-like pub/sub broker. Topics are fan-out queues.
All workers run as threads in the same process, so this is shared memory.
"""
import queue
import threading
from typing import Dict, List


class _InProcessBroker:
    def __init__(self):
        self._lock = threading.Lock()
        self._subscribers: Dict[str, List[queue.Queue]] = {}

    def subscribe(self, topics: List[str], maxsize: int = 500) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=maxsize)
        with self._lock:
            for t in topics:
                self._subscribers.setdefault(t, []).append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            for subs in self._subscribers.values():
                try:
                    subs.remove(q)
                except ValueError:
                    pass

    def publish(self, topic: str, key: str, payload: dict) -> None:
        with self._lock:
            subs = list(self._subscribers.get(topic, []))
        msg = {"topic": topic, "key": key, "payload": payload}
        for q in subs:
            try:
                q.put_nowait(msg)
            except queue.Full:
                pass  # slow consumer; drop rather than block


broker = _InProcessBroker()

ORDER_TOPICS = [
    "order.created",
    "order.processing",
    "order.completed",
    "order.failed",
    "order.dead",
    "order.cancelled",
]
