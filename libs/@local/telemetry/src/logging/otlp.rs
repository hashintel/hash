use error_stack::Report;
use opentelemetry::{InstrumentationScope, logs::LogRecord as _, trace::TraceContextExt as _};
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_otlp::{ExporterBuildError, WithExportConfig as _};
use opentelemetry_sdk::{
    Resource,
    error::OTelSdkResult,
    logs::{LogProcessor, SdkLogRecord, SdkLoggerProvider},
};
use tracing::{Span, Subscriber};
use tracing_opentelemetry::OpenTelemetrySpanExt as _;
use tracing_subscriber::{Layer, registry::LookupSpan};

use crate::OtlpConfig;

/// Custom [`LogProcessor`] that enriches log records with trace context
#[derive(Debug)]
struct TraceContextEnrichmentProcessor;

impl LogProcessor for TraceContextEnrichmentProcessor {
    fn emit(&self, data: &mut SdkLogRecord, _instrumentation: &InstrumentationScope) {
        let tracing_span = Span::current();
        let otel_context = tracing_span.context();
        let otel_span = otel_context.span();
        let span_context = otel_span.span_context();

        if span_context.is_valid() {
            data.add_attributes([
                ("trace_id", span_context.trace_id().to_string()),
                ("span_id", span_context.span_id().to_string()),
            ]);
        }
    }

    fn force_flush(&self) -> OTelSdkResult {
        Ok(())
    }

    fn shutdown(&self) -> OTelSdkResult {
        Ok(())
    }
}

pub(crate) fn provider(
    config: &OtlpConfig,
    service_name: &'static str,
) -> Result<Option<SdkLoggerProvider>, Report<ExporterBuildError>> {
    let Some(endpoint) = config.endpoint.as_deref() else {
        return Ok(None);
    };

    Ok(Some(
        SdkLoggerProvider::builder()
            .with_resource(Resource::builder().with_service_name(service_name).build())
            .with_log_processor(TraceContextEnrichmentProcessor)
            .with_batch_exporter(
                opentelemetry_otlp::LogExporter::builder()
                    .with_tonic()
                    .with_endpoint(endpoint)
                    .build()?,
            )
            .build(),
    ))
}

#[must_use]
#[expect(
    clippy::min_ident_chars,
    reason = "False positive for a generic argument"
)]
pub(crate) fn layer<S>(provider: &SdkLoggerProvider) -> impl Layer<S> + use<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    OpenTelemetryTracingBridge::new(provider).with_filter(crate::logging::env_filter(None))
}
