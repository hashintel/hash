"""Check exported telemetry through the real FastAPI middleware."""

import asyncio
import io
import logging
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, LogRecordExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import (
    ConsoleMetricExporter,
    MetricExporter,
    PeriodicExportingMetricReader,
)
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SpanExporter
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind, StatusCode
from starlette.types import Message, Scope

from petrinaut_optimization import telemetry
from petrinaut_optimization.api import app, application
from petrinaut_optimization.api.optimize import optimize_router
from petrinaut_optimization.optimization_runs import OptimizationRun, RunState
from petrinaut_optimization.service import OptimizationService

_TRACE_ID = "0af7651916cd43dd8448eb211c80319c"
_PARENT_ID = "b7ad6b7169203331"


@dataclass
class TelemetryHarness:
    app: FastAPI = field(default_factory=FastAPI)
    owner: telemetry.Telemetry = field(default_factory=telemetry.Telemetry)
    spans: InMemorySpanExporter = field(default_factory=InMemorySpanExporter)
    logs: InMemoryLogRecordExporter = field(default_factory=InMemoryLogRecordExporter)
    tracers: list[TracerProvider] = field(default_factory=list)
    meters: list[MeterProvider] = field(default_factory=list)


@pytest.fixture
def harness(monkeypatch: pytest.MonkeyPatch) -> Iterator[TelemetryHarness]:
    fixture = TelemetryHarness()
    fixture.app.include_router(optimize_router, prefix="/optimize")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc")
    monkeypatch.setattr(
        telemetry,
        "_exporter_factories",
        lambda _protocol: (
            lambda: fixture.spans,
            lambda: ConsoleMetricExporter(out=io.StringIO()),
            lambda: fixture.logs,
        ),
    )
    monkeypatch.setattr(telemetry.trace, "set_tracer_provider", fixture.tracers.append)
    monkeypatch.setattr(telemetry.metrics, "set_meter_provider", fixture.meters.append)
    for logger_name in telemetry._SERVICE_LOGGER_NAMES:
        service_logger = logging.getLogger(logger_name)
        monkeypatch.setattr(service_logger, "level", service_logger.level)
        monkeypatch.setattr(service_logger, "handlers", [])
    try:
        yield fixture
    finally:
        if fixture.owner.providers is not None:
            telemetry.FastAPIInstrumentor.uninstrument_app(fixture.app)
            fixture.owner.providers.shutdown()


def test_setup_without_endpoint(harness: TelemetryHarness, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    assert not harness.owner.setup(harness.app)
    assert harness.owner.providers is None
    assert harness.tracers == []
    assert harness.meters == []


def test_setup_publication_and_flush(harness: TelemetryHarness) -> None:
    assert harness.owner.setup(harness.app)
    providers = harness.owner.providers
    assert providers is not None
    assert harness.owner.setup(harness.app)
    assert harness.tracers == [providers.tracer]
    assert harness.meters == [providers.meter]
    for logger_name in telemetry._SERVICE_LOGGER_NAMES:
        service_logger = logging.getLogger(logger_name)
        assert service_logger.level == logging.INFO
        assert service_logger.handlers == [providers.handler]
    assert providers.handler not in logging.getLogger().handlers

    logging.getLogger("pn_api").info("first lifecycle event")
    logging.getLogger("opentelemetry.exporter").error("exporter failure")
    harness.owner.flush()
    bodies = [record.log_record.body for record in harness.logs.get_finished_logs()]
    assert bodies.count("first lifecycle event") == 1
    assert "exporter failure" not in bodies
    logging.getLogger("pn_runs").info("second lifecycle event")
    harness.owner.flush()
    assert harness.logs.get_finished_logs()[-1].log_record.body == "second lifecycle event"


def test_setup_rollback_and_retry(
    harness: TelemetryHarness, monkeypatch: pytest.MonkeyPatch
) -> None:
    shut_down: list[telemetry.TelemetryProvider] = []
    shutdown_provider = telemetry._shutdown_provider

    def shutdown(provider: telemetry.TelemetryProvider) -> None:
        shut_down.append(provider)
        shutdown_provider(provider)

    def fail_instrumentation(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("instrumentation failed")

    with monkeypatch.context() as failure:
        failure.setattr(telemetry, "_shutdown_provider", shutdown)
        failure.setattr(telemetry.FastAPIInstrumentor, "instrument_app", fail_instrumentation)
        assert not harness.owner.setup(harness.app)
    assert len(shut_down) == 3
    assert harness.tracers == []
    assert harness.meters == []
    assert harness.owner.providers is None
    for logger_name in telemetry._SERVICE_LOGGER_NAMES:
        assert logging.getLogger(logger_name).handlers == []

    # Exporters belong to the failed providers; a retry constructs fresh ones.
    harness.spans = InMemorySpanExporter()
    harness.logs = InMemoryLogRecordExporter()
    assert harness.owner.setup(harness.app)
    with TestClient(harness.app) as client:
        assert client.get("/missing").status_code == 404
    harness.owner.flush()
    assert (
        len([span for span in harness.spans.get_finished_spans() if span.kind is SpanKind.SERVER])
        == 1
    )


def observe_exporter[Exporter: (SpanExporter, MetricExporter, LogRecordExporter)](
    factory: Callable[[], Exporter], monkeypatch: pytest.MonkeyPatch, shutdowns: list[Mock]
) -> Callable[[], Exporter]:
    def create() -> Exporter:
        exporter = factory()
        shutdown = Mock(wraps=exporter.shutdown)
        monkeypatch.setattr(exporter, "shutdown", shutdown)
        shutdowns.append(shutdown)
        return exporter

    return create


@pytest.mark.parametrize(
    ("variable", "value", "exporter_count", "reader_count"),
    [
        ("OTEL_BSP_MAX_QUEUE_SIZE", "0", 1, 0),
        ("OTEL_EXPORTER_OTLP_METRICS_TIMEOUT", "not-a-number", 1, 0),
        ("OTEL_METRIC_EXPORT_INTERVAL", "0", 2, 0),
        ("OTEL_METRICS_EXEMPLAR_FILTER", "invalid-filter", 2, 1),
        ("OTEL_EXPORTER_OTLP_LOGS_TIMEOUT", "not-a-number", 2, 1),
        ("OTEL_BLRP_MAX_QUEUE_SIZE", "0", 3, 1),
    ],
)
def test_setup_constructor_rollback(
    *,
    monkeypatch: pytest.MonkeyPatch,
    variable: str,
    value: str,
    exporter_count: int,
    reader_count: int,
) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:1")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
    monkeypatch.setenv(variable, value)
    shutdowns: list[Mock] = []
    readers: list[PeriodicExportingMetricReader] = []
    tracer_publications: list[TracerProvider] = []
    meter_publications: list[MeterProvider] = []
    reader_factory = telemetry.PeriodicExportingMetricReader

    def create_reader(exporter: MetricExporter) -> PeriodicExportingMetricReader:
        reader = reader_factory(exporter)
        readers.append(reader)
        return reader

    monkeypatch.setattr(telemetry, "PeriodicExportingMetricReader", create_reader)
    monkeypatch.setattr(
        telemetry,
        "HttpSpanExporter",
        observe_exporter(telemetry.HttpSpanExporter, monkeypatch, shutdowns),
    )
    monkeypatch.setattr(
        telemetry,
        "HttpMetricExporter",
        observe_exporter(telemetry.HttpMetricExporter, monkeypatch, shutdowns),
    )
    monkeypatch.setattr(
        telemetry,
        "HttpLogExporter",
        observe_exporter(telemetry.HttpLogExporter, monkeypatch, shutdowns),
    )
    monkeypatch.setattr(telemetry.trace, "set_tracer_provider", tracer_publications.append)
    monkeypatch.setattr(telemetry.metrics, "set_meter_provider", meter_publications.append)
    owner = telemetry.Telemetry()
    try:
        assert not owner.setup(FastAPI())
        assert owner.providers is None
        assert tracer_publications == []
        assert meter_publications == []
        assert len(shutdowns) == exporter_count
        for shutdown in shutdowns:
            assert shutdown.call_count == 1
        assert len(readers) == reader_count
        for reader in readers:
            assert reader._daemon_thread is not None
            assert not reader._daemon_thread.is_alive()
    finally:
        # A failing regression must not leave its own background worker running.
        for reader in readers:
            if reader._daemon_thread is not None and reader._daemon_thread.is_alive():
                reader.shutdown()
        for shutdown in shutdowns:
            if not shutdown.called:
                shutdown()


def test_lifespan_flush(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[None] = []
    monkeypatch.setattr(application.telemetry, "flush", lambda: calls.append(None))
    with TestClient(app):
        assert calls == []
    assert len(calls) == 1
    with TestClient(app):
        assert len(calls) == 1
    assert len(calls) == 2


def request_scope(service: OptimizationService, *, run_id: str, account: str) -> Scope:
    path = f"/optimize/runs/{run_id}/events"
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"x-hash-account-id", account.encode()),
            (b"traceparent", f"00-{_TRACE_ID}-{_PARENT_ID}-01".encode()),
        ],
        "client": ("127.0.0.1", 1234),
        "server": ("localhost", 4004),
        "state": {"service": service},
    }


def register_run(service: OptimizationService) -> OptimizationRun:
    closed: asyncio.Future[None] = asyncio.get_running_loop().create_future()
    closed.set_result(None)
    run = OptimizationRun(
        run_id="telemetry-run",
        optimizer=None,
        cleanup=lambda: closed,
        account_id="owner",
        requested_trials=1,
    )
    service.runs._runs[run.run_id] = run
    return run


def assert_request_span(harness: TelemetryHarness, *, status: int) -> None:
    spans = [span for span in harness.spans.get_finished_spans() if span.kind is SpanKind.SERVER]
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "GET /optimize/runs/{run_id}/events"
    assert span.context is not None
    assert span.context.trace_id == int(_TRACE_ID, 16)
    assert span.parent is not None
    assert span.parent.span_id == int(_PARENT_ID, 16)
    assert span.attributes is not None
    assert span.attributes["http.status_code"] == status
    assert span.status.status_code is StatusCode.UNSET


@pytest.mark.asyncio
@pytest.mark.parametrize("ending", ["terminal", "disconnect"])
async def test_stream_span_lifetime(harness: TelemetryHarness, ending: str) -> None:
    assert harness.owner.setup(harness.app)
    service = OptimizationService()
    run = register_run(service)
    run.append_event('data: {"step": 0}\n\n')
    incoming: asyncio.Queue[Message] = asyncio.Queue()
    incoming.put_nowait({"type": "http.request", "body": b"", "more_body": False})
    outgoing: list[Message] = []
    body_started = asyncio.Event()
    release_body = asyncio.Event()

    async def send(message: Message) -> None:
        outgoing.append(message)
        if message["type"] == "http.response.body" and message.get("more_body"):
            body_started.set()
            await release_body.wait()

    request = asyncio.create_task(
        harness.app(request_scope(service, run_id=run.run_id, account="owner"), incoming.get, send)
    )
    try:
        await asyncio.wait_for(body_started.wait(), timeout=2)
        harness.owner.flush()
        assert not request.done()
        assert not [
            span for span in harness.spans.get_finished_spans() if span.kind is SpanKind.SERVER
        ]
        assert run.attached
        if ending == "terminal":
            run.append_event("event: done\ndata: {}\n\n")
            run.mark_terminal(RunState.completed)
        else:
            incoming.put_nowait({"type": "http.disconnect"})
        release_body.set()
        await asyncio.wait_for(request, timeout=2)
        harness.owner.flush()
        assert_request_span(harness, status=200)
        assert not run.attached
        assert outgoing[0]["status"] == 200
        if ending == "disconnect":
            assert run.state is RunState.running
            assert not run.cancel_requested.is_set()
        else:
            assert any(b"event: done" in message.get("body", b"") for message in outgoing)
    finally:
        release_body.set()
        if not request.done():
            request.cancel()
        await asyncio.gather(request, return_exceptions=True)
        await service.shutdown()


@pytest.mark.asyncio
@pytest.mark.parametrize("run_id", ["telemetry-run", "absent"])
async def test_missing_run_span(harness: TelemetryHarness, run_id: str) -> None:
    assert harness.owner.setup(harness.app)
    service = OptimizationService()
    register_run(service)
    incoming: asyncio.Queue[Message] = asyncio.Queue()
    incoming.put_nowait({"type": "http.request", "body": b"", "more_body": False})
    outgoing: asyncio.Queue[Message] = asyncio.Queue()
    try:
        await harness.app(
            request_scope(service, run_id=run_id, account="other"), incoming.get, outgoing.put
        )
        harness.owner.flush()
        assert outgoing.get_nowait()["status"] == 404
        assert_request_span(harness, status=404)
    finally:
        await service.shutdown()
