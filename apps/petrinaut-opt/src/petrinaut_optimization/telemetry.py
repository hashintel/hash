"""Export service traces, metrics and logs through the configured OTLP collector.

Without ``OTEL_EXPORTER_OTLP_ENDPOINT``, the service runs without exporters.
``OTEL_EXPORTER_OTLP_PROTOCOL`` selects ``grpc`` (default) or ``http/protobuf``;
exporters read the remaining standard OTLP environment variables themselves.
The application owns the providers and flushes them after its runs shut down.
"""

import logging
from collections.abc import Callable
from contextlib import ExitStack, suppress
from dataclasses import dataclass
from typing import Literal, assert_never

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter as GrpcLogExporter  # ruff: ignore[import-private-name]
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
    OTLPMetricExporter as GrpcMetricExporter,
)
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
    OTLPSpanExporter as GrpcSpanExporter,
)
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter as HttpLogExporter  # ruff: ignore[import-private-name]
from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
    OTLPMetricExporter as HttpMetricExporter,
)
from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
    OTLPSpanExporter as HttpSpanExporter,
)
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler  # ruff: ignore[import-private-name]
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor, LogRecordExporter  # ruff: ignore[import-private-name]
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import MetricExporter, PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter
from pydantic import AnyUrl, Field
from pydantic_settings import BaseSettings

_DEFAULT_SERVICE_NAME = "Petrinaut Optimizer"
_SERVICE_LOGGER_NAMES = ("pn_api", "pn_optimize", "pn_runs", "pn_telemetry")
_FASTAPI_EXCLUDED_URLS = r"/health(/|$),/status(/|$)"

log = logging.getLogger("pn_telemetry")

type TelemetryProvider = TracerProvider | MeterProvider | LoggerProvider

TelemetryProtocol = Literal["grpc", "http/protobuf"]


def _exporter_factories(
    protocol: TelemetryProtocol,
) -> tuple[
    Callable[[], SpanExporter], Callable[[], MetricExporter], Callable[[], LogRecordExporter]
]:
    match protocol:
        case "grpc":
            return GrpcSpanExporter, GrpcMetricExporter, GrpcLogExporter
        case "http/protobuf":
            return HttpSpanExporter, HttpMetricExporter, HttpLogExporter
        case protocol:
            assert_never(protocol)


def _shutdown_provider(provider: TelemetryProvider) -> None:
    with suppress(Exception):
        provider.force_flush()

    with suppress(Exception):
        provider.shutdown()


def _create_tracer(factory: Callable[[], SpanExporter], resource: Resource) -> TracerProvider:
    with ExitStack() as rollback:
        tracer = TracerProvider(resource=resource)
        rollback.callback(_shutdown_provider, tracer)

        with ExitStack() as pending:
            exporter = factory()

            pending.callback(exporter.shutdown)
            processor = BatchSpanProcessor(exporter)
            pending.pop_all()

            pending.callback(processor.shutdown)
            tracer.add_span_processor(processor)
            pending.pop_all()

        rollback.pop_all()

    return tracer


def _create_meter(factory: Callable[[], MetricExporter], resource: Resource) -> MeterProvider:
    with ExitStack() as pending:
        exporter = factory()

        pending.callback(exporter.shutdown)
        reader = PeriodicExportingMetricReader(exporter)
        pending.pop_all()

        pending.callback(reader.shutdown)
        meter = MeterProvider(resource=resource, metric_readers=[reader])
        pending.pop_all()

    return meter


def _create_logger(factory: Callable[[], LogRecordExporter], resource: Resource) -> LoggerProvider:
    with ExitStack() as rollback:
        logger = LoggerProvider(resource=resource)
        rollback.callback(_shutdown_provider, logger)

        with ExitStack() as pending:
            exporter = factory()

            pending.callback(exporter.shutdown)
            processor = BatchLogRecordProcessor(exporter)
            pending.pop_all()

            pending.callback(processor.shutdown)
            logger.add_log_record_processor(processor)
            pending.pop_all()

        rollback.pop_all()

    return logger


@dataclass(frozen=True, slots=True, kw_only=True)
class _Providers:
    tracer: TracerProvider
    meter: MeterProvider
    logger: LoggerProvider
    handler: LoggingHandler

    @classmethod
    def create(cls, *, protocol: TelemetryProtocol, service_name: str) -> _Providers:
        span_exporter, metric_exporter, log_exporter = _exporter_factories(protocol)

        resource = Resource.create({"service.name": service_name})
        with ExitStack() as rollback:
            tracer = _create_tracer(span_exporter, resource)
            rollback.callback(_shutdown_provider, tracer)

            meter = _create_meter(metric_exporter, resource)
            rollback.callback(_shutdown_provider, meter)

            logger = _create_logger(log_exporter, resource)
            rollback.callback(_shutdown_provider, logger)

            handler = LoggingHandler(level=logging.INFO, logger_provider=logger)
            rollback.pop_all()

        return cls(tracer=tracer, meter=meter, logger=logger, handler=handler)

    def publish(self) -> None:
        # Global providers are one-shot: publish only after instrumentation succeeds.
        trace.set_tracer_provider(self.tracer)
        metrics.set_meter_provider(self.meter)

        for logger_name in _SERVICE_LOGGER_NAMES:
            service_logger = logging.getLogger(logger_name)
            service_logger.setLevel(logging.INFO)
            service_logger.addHandler(self.handler)

    def flush(self) -> None:
        for provider in (self.logger, self.meter, self.tracer):
            with suppress(Exception):
                provider.force_flush()

    def shutdown(self) -> None:
        for provider in (self.logger, self.meter, self.tracer):
            _shutdown_provider(provider)

        self.handler.close()


class TelemetrySettings(BaseSettings):
    endpoint: AnyUrl | None = Field(alias="OTEL_EXPORTER_OTLP_ENDPOINT", default=None)
    protocol: TelemetryProtocol = Field(alias="OTEL_EXPORTER_OTLP_PROTOCOL", default="grpc")
    service_name: str = Field(alias="OTEL_SERVICE_NAME", default=_DEFAULT_SERVICE_NAME)


class Telemetry:
    """Retain the application's telemetry providers across lifespan restarts."""

    def __init__(self) -> None:
        self.providers: _Providers | None = None

    def setup(self, app: FastAPI) -> bool:
        """Configure once; report bootstrap failures without preventing startup."""
        if self.providers is not None:
            return True

        settings = TelemetrySettings()

        if not settings.endpoint:
            log.info("OTEL_EXPORTER_OTLP_ENDPOINT unset; starting without OpenTelemetry")
            return False

        providers: _Providers | None = None
        try:
            providers = _Providers.create(
                protocol=settings.protocol, service_name=settings.service_name
            )
            FastAPIInstrumentor.instrument_app(
                app,
                tracer_provider=providers.tracer,
                meter_provider=providers.meter,
                excluded_urls=_FASTAPI_EXCLUDED_URLS,
            )
        except Exception:
            log.exception("OpenTelemetry bootstrap failed; continuing without telemetry")
            if providers is not None:
                providers.shutdown()
            return False

        providers.publish()
        self.providers = providers
        log.info(
            "OpenTelemetry exporting to %s as %r over %s",
            settings.endpoint,
            settings.service_name,
            settings.protocol,
        )

        return True

    def flush(self) -> None:
        """Flush buffered telemetry without shutting down process-global providers."""
        if self.providers is not None:
            self.providers.flush()
