"""OpenTelemetry bootstrap for the Petrinaut optimization API.

Traces, metrics, and logs are exported over OTLP to the collector named by
``OTEL_EXPORTER_OTLP_ENDPOINT`` — the same ``otel-collector`` target the rest of
the HASH stack uses. When that variable is unset (a plain ``uv run`` with no
collector), instrumentation is skipped and the service runs without telemetry,
mirroring the Node workers' behaviour.

Standard OTLP configuration is read directly by the exporters, including
per-signal endpoint overrides and transport security. Two service-wide
variables are also used here:

- ``OTEL_EXPORTER_OTLP_PROTOCOL`` selects the wire protocol: ``grpc`` (default,
  the collector's ``:4317`` port) or ``http/protobuf`` (its ``:4318`` port).
- ``OTEL_SERVICE_NAME`` sets the ``service.name`` shown in Tempo/Grafana,
  defaulting to ``Petrinaut Optimizer``.

``setup_telemetry`` is idempotent per process: the first call installs the
providers and instruments the FastAPI app; later calls are no-ops.
"""

from __future__ import annotations

import logging
import os
from contextlib import suppress
from typing import Any

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor, LogExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import (
    MetricExporter,
    PeriodicExportingMetricReader,
)
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter

_DEFAULT_SERVICE_NAME = "Petrinaut Optimizer"
_DEFAULT_PROTOCOL = "grpc"
_SERVICE_LOGGER_NAMES = ("pn_api", "pn_optimize", "pn_telemetry")
_FASTAPI_EXCLUDED_URLS = r"status$"

log = logging.getLogger("pn_telemetry")

_configured = False

# Providers created by ``setup_telemetry``, retained so the app lifespan can
# flush them without shutting down process-global OTEL state.
_providers: list[Any] = []


def _service_name() -> str:
    return os.environ.get("OTEL_SERVICE_NAME", _DEFAULT_SERVICE_NAME)


def _protocol() -> str:
    return (
        os.environ.get("OTEL_EXPORTER_OTLP_PROTOCOL", _DEFAULT_PROTOCOL).strip().lower()
    )


def _build_exporters(
    protocol: str,
) -> tuple[SpanExporter, MetricExporter, LogExporter]:
    """Return the (span, metric, log) exporters for the requested OTLP protocol.

    Raises ``ValueError`` for an unrecognised ``OTEL_EXPORTER_OTLP_PROTOCOL``.
    Exporter configuration comes from the standard ``OTEL_EXPORTER_OTLP_*``
    environment variables.
    """
    if protocol == "grpc":
        from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )

        return OTLPSpanExporter(), OTLPMetricExporter(), OTLPLogExporter()

    if protocol == "http/protobuf":
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )

        return OTLPSpanExporter(), OTLPMetricExporter(), OTLPLogExporter()

    raise ValueError(
        f"unsupported OTEL_EXPORTER_OTLP_PROTOCOL {protocol!r}; "
        "expected 'grpc' or 'http/protobuf'"
    )


def setup_telemetry(app: FastAPI) -> bool:
    """Install OTLP providers and instrument ``app``.

    Returns ``True`` when telemetry was configured, ``False`` when it was skipped
    because ``OTEL_EXPORTER_OTLP_ENDPOINT`` is unset. Bootstrap failures are
    logged and swallowed so a misconfigured collector never stops the API from
    serving.
    """
    global _configured
    if _configured:
        return True

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        log.info("OTEL_EXPORTER_OTLP_ENDPOINT unset; starting without OpenTelemetry")
        return False

    providers: list[Any] = []
    try:
        protocol = _protocol()
        span_exporter, metric_exporter, log_exporter = _build_exporters(protocol)

        resource = Resource.create({"service.name": _service_name()})

        tracer_provider = TracerProvider(resource=resource)
        providers.append(tracer_provider)
        tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))

        meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[PeriodicExportingMetricReader(metric_exporter)],
        )
        providers.append(meter_provider)

        logger_provider = LoggerProvider(resource=resource)
        providers.append(logger_provider)
        logger_provider.add_log_record_processor(
            BatchLogRecordProcessor(log_exporter)
        )
        # Bridge stdlib logging (`log.info(...)` across the service) to OTLP so
        # records reach Loki alongside the traces they belong to.
        logging_handler = LoggingHandler(
            level=logging.INFO, logger_provider=logger_provider
        )

        FastAPIInstrumentor.instrument_app(
            app,
            tracer_provider=tracer_provider,
            meter_provider=meter_provider,
            excluded_urls=_FASTAPI_EXCLUDED_URLS,
        )
    except Exception:
        log.exception("OpenTelemetry bootstrap failed; continuing without telemetry")
        _shutdown_unpublished_providers(providers)
        return False

    # Publish process-global state only after every fallible setup step succeeds.
    # OTEL providers are one-shot globals, so a failure after either setter could
    # not be rolled back safely.
    trace.set_tracer_provider(tracer_provider)
    metrics.set_meter_provider(meter_provider)
    for logger_name in _SERVICE_LOGGER_NAMES:
        service_logger = logging.getLogger(logger_name)
        service_logger.setLevel(logging.INFO)
        service_logger.addHandler(logging_handler)

    _providers.extend(providers)
    _configured = True
    log.info(
        "OpenTelemetry exporting to %s as %r over %s",
        endpoint,
        _service_name(),
        protocol,
    )
    return True


def flush_telemetry() -> None:
    """Flush buffered telemetry without shutting down the providers."""
    for provider in reversed(_providers):
        with suppress(Exception):
            provider.force_flush()


def _shutdown_unpublished_providers(providers: list[Any]) -> None:
    """Clean up providers that have not been published as OTEL globals."""
    for provider in reversed(providers):
        with suppress(Exception):
            provider.force_flush()
        with suppress(Exception):
            provider.shutdown()
