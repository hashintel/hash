from __future__ import annotations

import io
import logging

from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter
from opentelemetry.sdk.metrics.export import ConsoleMetricExporter
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)

from src import optimization_api, telemetry


class _SpyProvider:
    """Stands in for a TracerProvider/MeterProvider/LoggerProvider."""

    def __init__(self) -> None:
        self.flushed = 0
        self.shut = 0

    def force_flush(self, *_args: object, **_kwargs: object) -> bool:
        self.flushed += 1
        return True

    def shutdown(self, *_args: object, **_kwargs: object) -> None:
        self.shut += 1


def test_shutdown_flushes_then_shuts_down_and_clears_providers(monkeypatch) -> None:
    spies = [_SpyProvider() for _ in range(3)]
    monkeypatch.setattr(telemetry, "_providers", list(spies))

    telemetry.shutdown_telemetry()

    assert all(spy.flushed == 1 for spy in spies)
    assert all(spy.shut == 1 for spy in spies)
    assert telemetry._providers == []

    # Idempotent: a second call (e.g. lifespan teardown then atexit) is a no-op.
    telemetry.shutdown_telemetry()
    assert all(spy.shut == 1 for spy in spies)


def test_shutdown_is_a_no_op_when_telemetry_was_never_configured(monkeypatch) -> None:
    monkeypatch.setattr(telemetry, "_providers", [])
    telemetry.shutdown_telemetry()  # must not raise
    assert telemetry._providers == []


def test_setup_registers_providers_for_shutdown(monkeypatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    monkeypatch.setattr(telemetry, "_configured", False)
    monkeypatch.setattr(telemetry, "_providers", [])
    # Avoid opening real OTLP connections: swap the exporters for in-memory ones.
    monkeypatch.setattr(
        telemetry,
        "_build_exporters",
        lambda _endpoint, _protocol: (
            InMemorySpanExporter(),
            ConsoleMetricExporter(out=io.StringIO()),
            InMemoryLogRecordExporter(),
        ),
    )

    assert telemetry.setup_telemetry(FastAPI()) is True
    # One provider each for traces, metrics, and logs.
    assert len(telemetry._providers) == 3

    telemetry.shutdown_telemetry()
    assert telemetry._providers == []


def test_setup_cleans_up_partial_configuration(monkeypatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    monkeypatch.setattr(telemetry, "_configured", False)
    monkeypatch.setattr(telemetry, "_providers", [])
    monkeypatch.setattr(telemetry, "_logging_handlers", [])
    monkeypatch.setattr(
        telemetry,
        "_build_exporters",
        lambda _endpoint, _protocol: (
            InMemorySpanExporter(),
            ConsoleMetricExporter(out=io.StringIO()),
            InMemoryLogRecordExporter(),
        ),
    )

    def fail_instrumentation(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("instrumentation failed")

    monkeypatch.setattr(
        telemetry.FastAPIInstrumentor, "instrument_app", fail_instrumentation
    )
    original_handlers = list(logging.getLogger().handlers)

    assert telemetry.setup_telemetry(FastAPI()) is False
    assert telemetry._providers == []
    assert telemetry._logging_handlers == []
    assert logging.getLogger().handlers == original_handlers


def test_lifespan_shuts_down_telemetry_on_exit(monkeypatch) -> None:
    calls = {"count": 0}

    def _spy() -> None:
        calls["count"] += 1

    monkeypatch.setattr(optimization_api, "shutdown_telemetry", _spy)

    with TestClient(optimization_api.app):
        assert calls["count"] == 0  # not yet — only on teardown

    assert calls["count"] == 1
