import importlib.util
import os
import sys
import types
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
MODULE_PATHS = [
    BACKEND_DIR / "main.py",
    BACKEND_DIR / "main_enterprise.py",
]


class FakeResponse:
    def __init__(self, *args, **kwargs):
        self.headers = {}


class FakeFastAPI:
    def __init__(self, *args, **kwargs):
        self.docs_url = kwargs.get("docs_url")
        self.redoc_url = kwargs.get("redoc_url")
        self.openapi_url = kwargs.get("openapi_url")
        self.middlewares = []
        self.state = types.SimpleNamespace()

    def add_middleware(self, middleware, **kwargs):
        self.middlewares.append((middleware, kwargs))

    def exception_handler(self, *args, **kwargs):
        def decorator(func):
            return func
        return decorator

    def middleware(self, *args, **kwargs):
        def decorator(func):
            return func
        return decorator

    def get(self, *args, **kwargs):
        def decorator(func):
            return func
        return decorator

    def post(self, *args, **kwargs):
        def decorator(func):
            return func
        return decorator


class FakeLimiter:
    def __init__(self, *args, **kwargs):
        self.default_limits = kwargs.get("default_limits", [])

    def limit(self, *args, **kwargs):
        def decorator(func):
            return func
        return decorator


class FakeMetric:
    def labels(self, *args, **kwargs):
        return self

    def inc(self, *args, **kwargs):
        return None

    def observe(self, *args, **kwargs):
        return None


def install_stubs():
    modules = {}

    fastapi = types.ModuleType("fastapi")
    fastapi.FastAPI = FakeFastAPI
    fastapi.HTTPException = type("HTTPException", (Exception,), {})
    fastapi.Query = lambda default=None, **kwargs: default
    fastapi.Request = type("Request", (), {})
    modules["fastapi"] = fastapi

    cors = types.ModuleType("fastapi.middleware.cors")
    cors.CORSMiddleware = type("CORSMiddleware", (), {})
    modules["fastapi.middleware.cors"] = cors

    gzip_fastapi = types.ModuleType("fastapi.middleware.gzip")
    gzip_fastapi.GZIPMiddleware = type("GZIPMiddleware", (), {})
    modules["fastapi.middleware.gzip"] = gzip_fastapi

    trustedhost = types.ModuleType("fastapi.middleware.trustedhost")
    trustedhost.TrustedHostMiddleware = type("TrustedHostMiddleware", (), {})
    modules["fastapi.middleware.trustedhost"] = trustedhost

    starlette_gzip = types.ModuleType("starlette.middleware.gzip")
    starlette_gzip.GZipMiddleware = type("GZipMiddleware", (), {})
    modules["starlette.middleware.gzip"] = starlette_gzip

    responses = types.ModuleType("fastapi.responses")
    responses.RedirectResponse = FakeResponse
    responses.StreamingResponse = FakeResponse
    responses.JSONResponse = FakeResponse
    responses.PlainTextResponse = FakeResponse
    modules["fastapi.responses"] = responses

    exceptions = types.ModuleType("fastapi.exceptions")
    exceptions.RequestValidationError = type("RequestValidationError", (Exception,), {})
    modules["fastapi.exceptions"] = exceptions

    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = object
    pydantic.Field = lambda *args, **kwargs: None
    modules["pydantic"] = pydantic

    requests = types.ModuleType("requests")
    requests.get = lambda *args, **kwargs: None
    modules["requests"] = requests

    yt_dlp = types.ModuleType("yt_dlp")
    yt_dlp.YoutubeDL = type("YoutubeDL", (), {})
    modules["yt_dlp"] = yt_dlp

    redis = types.ModuleType("redis")
    redis.Redis = type("Redis", (), {"__init__": lambda self, *args, **kwargs: None})
    modules["redis"] = redis

    redis_connection = types.ModuleType("redis.connection")
    redis_connection.ConnectionPool = type("ConnectionPool", (), {"__init__": lambda self, *args, **kwargs: None})
    modules["redis.connection"] = redis_connection

    slowapi = types.ModuleType("slowapi")
    slowapi.Limiter = FakeLimiter
    modules["slowapi"] = slowapi

    slowapi_util = types.ModuleType("slowapi.util")
    slowapi_util.get_remote_address = lambda *args, **kwargs: "127.0.0.1"
    modules["slowapi.util"] = slowapi_util

    slowapi_errors = types.ModuleType("slowapi.errors")
    slowapi_errors.RateLimitExceeded = type("RateLimitExceeded", (Exception,), {})
    modules["slowapi.errors"] = slowapi_errors

    prometheus = types.ModuleType("prometheus_client")
    prometheus.Counter = lambda *args, **kwargs: FakeMetric()
    prometheus.Histogram = lambda *args, **kwargs: FakeMetric()
    prometheus.generate_latest = lambda: b""
    prometheus.CONTENT_TYPE_LATEST = "text/plain"
    modules["prometheus_client"] = prometheus

    return modules


def load_app(module_path: Path, enable_docs: str):
    module_name = f"test_{module_path.stem}_{enable_docs}_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)

    with patch.dict(os.environ, {"ENABLE_API_DOCS": enable_docs}, clear=False), patch.dict(sys.modules, install_stubs(), clear=False):
        assert spec.loader is not None
        spec.loader.exec_module(module)

    return module.app


class DocsConfigTests(unittest.TestCase):
    def test_docs_routes_enabled_by_default(self):
        for module_path in MODULE_PATHS:
            with self.subTest(module=module_path.name):
                app = load_app(module_path, "true")
                self.assertEqual(app.docs_url, "/docs")
                self.assertEqual(app.redoc_url, "/redoc")
                self.assertEqual(app.openapi_url, "/openapi.json")

    def test_docs_routes_disabled_when_flag_false(self):
        for module_path in MODULE_PATHS:
            with self.subTest(module=module_path.name):
                app = load_app(module_path, "false")
                self.assertIsNone(app.docs_url)
                self.assertIsNone(app.redoc_url)
                self.assertIsNone(app.openapi_url)


if __name__ == "__main__":
    unittest.main()
