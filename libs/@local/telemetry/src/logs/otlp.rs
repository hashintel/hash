use error_stack::Report;
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_otlp::{ExporterBuildError, WithExportConfig as _};
use opentelemetry_sdk::{Resource, logs::SdkLoggerProvider};
use tracing::Subscriber;
use tracing_subscriber::{Layer, registry::LookupSpan};

use crate::OtlpConfig;

pub(crate) fn provider(
    config: &OtlpConfig,
) -> Result<Option<SdkLoggerProvider>, Report<ExporterBuildError>> {
    let Some(endpoint) = config.logs_endpoint.as_deref() else {
        return Ok(None);
    };

    Ok(Some(
        SdkLoggerProvider::builder()
            .with_resource(Resource::builder().with_service_name("graph").build())
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
    OpenTelemetryTracingBridge::new(provider)
}
