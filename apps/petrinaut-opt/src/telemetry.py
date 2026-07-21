"""OpenTelemetry bootstrap for the Petrinaut optimization API.

Traces, metrics, and logs are exported over OTLP/gRPC to the collector named by
``HASH_OTLP_ENDPOINT`` — the same variable and ``otel-collector:4317`` target the
rest of the HASH stack uses. When that variable is unset (a plain ``uv run`` with
no collector), instrumentation is skipped and the service runs without telemetry,
mirroring the Node workers' behaviour.

``setup_telemetry`` is idempotent per process: the first call installs the
providers and instruments the FastAPI app; later calls are no-ops.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

_DEFAULT_SERVICE_NAME = "Petrinaut Optimizer"

log = logging.getLogger("pn_telemetry")

_configured = False


def setup_telemetry(app: FastAPI) -> bool:
    """Install OTLP providers and instrument ``app``.

    Returns ``True`` when telemetry was configured, ``False`` when it was skipped
    because ``HASH_OTLP_ENDPOINT`` is unset. Bootstrap failures are logged and
    swallowed so a misconfigured collector never stops the API from serving.
    """
    global _configured
    if _configured:
        return True

    endpoint = os.environ.get("HASH_OTLP_ENDPOINT")
    if not endpoint:
        log.info("HASH_OTLP_ENDPOINT unset; starting without OpenTelemetry")
        return False

    # gRPC transport security is inferred from the scheme: the local collector is
    # reached over plaintext `http://otel-collector:4317`, matching the stack's
    # `TRACING_PROVIDERS_OTLP_INSECURE` default.
    insecure = endpoint.startswith("http://")

    try:
        resource = Resource.create(
            {
                "service.name": os.environ.get(
                    "OTEL_SERVICE_NAME", _DEFAULT_SERVICE_NAME
                ),
            }
        )

        tracer_provider = TracerProvider(resource=resource)
        tracer_provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=insecure))
        )
        trace.set_tracer_provider(tracer_provider)

        meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[
                PeriodicExportingMetricReader(
                    OTLPMetricExporter(endpoint=endpoint, insecure=insecure)
                )
            ],
        )
        metrics.set_meter_provider(meter_provider)

        logger_provider = LoggerProvider(resource=resource)
        logger_provider.add_log_record_processor(
            BatchLogRecordProcessor(
                OTLPLogExporter(endpoint=endpoint, insecure=insecure)
            )
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

    _configured = True
    log.info("OpenTelemetry exporting to %s", endpoint)
    return True
