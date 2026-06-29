"""
Shared Redis client factory.
REDIS_FAKE=true  → in-process fakeredis (no server needed, dev/demo mode)
REDIS_FAKE=false → real Redis via REDIS_URL
"""
import os

from dotenv import load_dotenv

load_dotenv()

REDIS_FAKE = os.getenv("REDIS_FAKE", "false").lower() == "true"

if REDIS_FAKE:
    import fakeredis

    _server = fakeredis.FakeServer()

    def get_redis():
        return fakeredis.FakeRedis(server=_server, decode_responses=True)

    _redis = get_redis()
else:
    import redis as _redis_lib

    _REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    _redis = _redis_lib.from_url(_REDIS_URL, decode_responses=True,
                                 socket_timeout=5, socket_connect_timeout=5)

    def get_redis():
        return _redis
