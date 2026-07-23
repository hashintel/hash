"""OpenTelemetry bootstrap for the Petrinaut optimization API.

Traces, metrics, and logs are exported over OTLP to the collector named by
``OTEL_EXPORTER_OTLP_ENDPOINT`` — the same ``otel-collector`` target the rest of
the HASH stack uses. When that variable is unset (a plain ``uv run`` with no
collector), instrumentation is skipped and the service runs without telemetry,
mirroring the Node workers' behaviour.

Two further standard OTLP variables are honoured:

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

log = logging.getLogger("pn_telemetry")

_configured = False

# Providers created by ``setup_telemetry``, retained so the app lifespan can
# flush and shut them down on exit. Each exposes ``force_flush``/``shutdown``.
_providers: list[Any] = []


def _service_name() -> str:
    return os.environ.get("OTEL_SERVICE_NAME", _DEFAULT_SERVICE_NAME)


def _protocol() -> str:
    return (
        os.environ.get("OTEL_EXPORTER_OTLP_PROTOCOL", _DEFAULT_PROTOCOL).strip().lower()
    )


def _build_exporters(
    endpoint: str, protocol: str
) -> tuple[SpanExporter, MetricExporter, LogExporter]:
    """Return the (span, metric, log) exporters for the requested OTLP protocol.

    Raises ``ValueError`` for an unrecognised ``OTEL_EXPORTER_OTLP_PROTOCOL``.
    """
    if protocol == "grpc":
        from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )

        # gRPC transport security is inferred from the scheme: the local
        # collector is reached over plaintext `http://otel-collector:4317`,
        # matching the stack's `TRACING_PROVIDERS_OTLP_INSECURE` default.
        insecure = endpoint.startswith("http://")
        return (
            OTLPSpanExporter(endpoint=endpoint, insecure=insecure),
            OTLPMetricExporter(endpoint=endpoint, insecure=insecure),
            OTLPLogExporter(endpoint=endpoint, insecure=insecure),
        )

    if protocol == "http/protobuf":
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )

        # The HTTP exporters take a full per-signal URL; TLS follows the scheme.
        base = endpoint.rstrip("/")
        return (
            OTLPSpanExporter(endpoint=f"{base}/v1/traces"),
            OTLPMetricExporter(endpoint=f"{base}/v1/metrics"),
            OTLPLogExporter(endpoint=f"{base}/v1/logs"),
        )

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

    try:
        protocol = _protocol()
        span_exporter, metric_exporter, log_exporter = _build_exporters(
            endpoint, protocol
        )

        resource = Resource.create({"service.name": _service_name()})

        tracer_provider = TracerProvider(resource=resource)
        tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))
        trace.set_tracer_provider(tracer_provider)

        meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[PeriodicExportingMetricReader(metric_exporter)],
        )
        metrics.set_meter_provider(meter_provider)

        logger_provider = LoggerProvider(resource=resource)
        logger_provider.add_log_record_processor(
            BatchLogRecordProcessor(log_exporter)
        )
        # Bridge stdlib logging (`log.info(...)` across the service) to OTLP so
        # records reach Loki alongside the traces they belong to.
        logging.getLogger().addHandler(
            LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
        )

        FastAPIInstrumentor.instrument_app(app, tracer_provider=tracer_provider)
    except Exception:
        log.exception("OpenTelemetry bootstrap failed; continuing without telemetry")
        return False

    # Retain for an explicit flush on shutdown; batch processors otherwise drop
    # whatever is still queued when the process exits.
    _providers.extend([tracer_provider, meter_provider, logger_provider])
    _configured = True
    log.info(
        "OpenTelemetry exporting to %s as %r over %s",
        endpoint,
        _service_name(),
        protocol,
    )
    return True


def shutdown_telemetry() -> None:
    """Flush and shut down the OTLP providers.

    Wired into the app lifespan's teardown so buffered spans, metrics, and log
    records are exported during a graceful (SIGTERM) shutdown rather than left in
    the batch processors' queues. Safe to call when telemetry was never
    configured (a no-op) and idempotent if called more than once.
    """
    while _providers:
        provider = _providers.pop()
        with suppress(Exception):
            provider.force_flush()
        with suppress(Exception):
            provider.shutdown()
