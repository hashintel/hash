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


def test_flush_preserves_active_providers(monkeypatch) -> None:
    spies = [_SpyProvider() for _ in range(3)]
    monkeypatch.setattr(telemetry, "_providers", list(spies))

    telemetry.flush_telemetry()

    assert all(spy.flushed == 1 for spy in spies)
    assert all(spy.shut == 0 for spy in spies)
    assert telemetry._providers == spies


def test_setup_configures_service_telemetry(monkeypatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    monkeypatch.setattr(telemetry, "_configured", False)
    monkeypatch.setattr(telemetry, "_providers", [])
    log_exporter = InMemoryLogRecordExporter()
    # Avoid opening real OTLP connections: swap the exporters for in-memory ones.
    monkeypatch.setattr(
        telemetry,
        "_build_exporters",
        lambda _protocol: (
            InMemorySpanExporter(),
            ConsoleMetricExporter(out=io.StringIO()),
            log_exporter,
        ),
    )
    tracer_providers: list[object] = []
    meter_providers: list[object] = []
    monkeypatch.setattr(telemetry.trace, "set_tracer_provider", tracer_providers.append)
    monkeypatch.setattr(telemetry.metrics, "set_meter_provider", meter_providers.append)
    instrumentation: dict[str, object] = {}

    def instrument(_app: FastAPI, **kwargs: object) -> None:
        instrumentation.update(kwargs)

    monkeypatch.setattr(telemetry.FastAPIInstrumentor, "instrument_app", instrument)
    original_handlers: dict[str, list[logging.Handler]] = {}
    for logger_name in telemetry._SERVICE_LOGGER_NAMES:
        service_logger = logging.getLogger(logger_name)
        monkeypatch.setattr(service_logger, "level", service_logger.level)
        original_handlers[logger_name] = list(service_logger.handlers)
        monkeypatch.setattr(service_logger, "handlers", list(service_logger.handlers))

    assert telemetry.setup_telemetry(FastAPI()) is True
    assert len(telemetry._providers) == 3
    assert tracer_providers == [telemetry._providers[0]]
    assert meter_providers == [telemetry._providers[1]]
    assert instrumentation["tracer_provider"] is telemetry._providers[0]
    assert instrumentation["meter_provider"] is telemetry._providers[1]
    assert instrumentation["excluded_urls"] == "status$"
    new_handlers = [
        handler
        for handler in logging.getLogger("pn_api").handlers
        if handler not in original_handlers["pn_api"]
    ]
    assert len(new_handlers) == 1
    handler = new_handlers[0]
    assert handler not in logging.getLogger().handlers
    for logger_name in telemetry._SERVICE_LOGGER_NAMES:
        service_logger = logging.getLogger(logger_name)
        assert service_logger.level == logging.INFO
        assert handler in service_logger.handlers

    logging.getLogger("pn_api").info("optimization lifecycle test")
    logging.getLogger("opentelemetry.exporter").error("exporter failure test")
    telemetry.flush_telemetry()
    exported_bodies = [
        record.log_record.body for record in log_exporter.get_finished_logs()
    ]
    assert "optimization lifecycle test" in exported_bodies
    assert "exporter failure test" not in exported_bodies

    telemetry._shutdown_unpublished_providers(telemetry._providers)
    telemetry._providers.clear()


def test_setup_cleans_up_partial_configuration(monkeypatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    monkeypatch.setattr(telemetry, "_configured", False)
    monkeypatch.setattr(telemetry, "_providers", [])
    monkeypatch.setattr(
        telemetry,
        "_build_exporters",
        lambda _protocol: (
            InMemorySpanExporter(),
            ConsoleMetricExporter(out=io.StringIO()),
            InMemoryLogRecordExporter(),
        ),
    )
    tracer_providers: list[object] = []
    meter_providers: list[object] = []
    monkeypatch.setattr(telemetry.trace, "set_tracer_provider", tracer_providers.append)
    monkeypatch.setattr(telemetry.metrics, "set_meter_provider", meter_providers.append)

    def fail_instrumentation(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("instrumentation failed")

    monkeypatch.setattr(
        telemetry.FastAPIInstrumentor, "instrument_app", fail_instrumentation
    )
    original_handlers = {
        logger_name: list(logging.getLogger(logger_name).handlers)
        for logger_name in telemetry._SERVICE_LOGGER_NAMES
    }

    assert telemetry.setup_telemetry(FastAPI()) is False
    assert tracer_providers == []
    assert meter_providers == []
    assert telemetry._providers == []
    for logger_name in telemetry._SERVICE_LOGGER_NAMES:
        assert logging.getLogger(logger_name).handlers == original_handlers[logger_name]


def test_lifespan_flushes_telemetry_on_exit(monkeypatch) -> None:
    calls = {"count": 0}

    def _spy() -> None:
        calls["count"] += 1

    monkeypatch.setattr(optimization_api, "flush_telemetry", _spy)

    with TestClient(optimization_api.app):
        assert calls["count"] == 0  # not yet — only on teardown

    assert calls["count"] == 1

    with TestClient(optimization_api.app):
        assert calls["count"] == 1

    assert calls["count"] == 2
