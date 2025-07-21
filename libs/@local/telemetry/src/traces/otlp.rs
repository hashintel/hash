use error_stack::Report;
use opentelemetry::global;
use opentelemetry_otlp::{ExporterBuildError, SpanExporter, WithExportConfig as _};
use opentelemetry_sdk::{Resource, propagation::TraceContextPropagator, trace::SdkTracerProvider};
use tracing::Subscriber;
use tracing_subscriber::{Layer, registry::LookupSpan};

use crate::OtlpConfig;

pub(crate) fn provider(
    config: &OtlpConfig,
    service_name: &'static str,
) -> Result<Option<SdkTracerProvider>, Report<ExporterBuildError>> {
    let Some(endpoint) = config.endpoint.as_deref() else {
        return Ok(None);
    };

    Ok(Some(
        SdkTracerProvider::builder()
            .with_resource(Resource::builder().with_service_name(service_name).build())
            .with_batch_exporter(
                SpanExporter::builder()
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
pub(crate) fn layer<S>(provider: &SdkTracerProvider) -> impl Layer<S> + use<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    // Allow correlating trace IDs
    global::set_text_map_propagator(TraceContextPropagator::new());

    tracing_opentelemetry::layer()
        .with_tracer(::opentelemetry::trace::TracerProvider::tracer(
            provider, "graph",
        ))
        .with_filter(crate::logging::env_filter(None))
}
