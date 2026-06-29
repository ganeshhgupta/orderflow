"""
Shared Redis client factory.
REDIS_FAKE=true  → in-process fakeredis (no server needed, dev/demo mode)
REDIS_FAKE=false → real Redis via REDIS_URL, falls back to fakeredis on error
"""
import logging
import os

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

REDIS_FAKE = os.getenv("REDIS_FAKE", "false").lower() == "true"

def _make_fake():
    import fakeredis
    _server = fakeredis.FakeServer()
    return fakeredis.FakeRedis(server=_server, decode_responses=True)

if REDIS_FAKE:
    _redis = _make_fake()
else:
    try:
        import redis as _redis_lib
        _REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _client = _redis_lib.from_url(_REDIS_URL, decode_responses=True,
                                      socket_timeout=5, socket_connect_timeout=5)
        _client.ping()  # fail fast at startup if URL is wrong
        _redis = _client
        logger.info("Redis connected: %s", _REDIS_URL.split("@")[-1])
    except Exception as e:
        logger.warning("Redis unavailable (%s) — falling back to fakeredis", e)
        _redis = _make_fake()
        REDIS_FAKE = True

def get_redis():
    return _redis
