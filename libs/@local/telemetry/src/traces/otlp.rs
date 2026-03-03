use error_stack::Report;
use opentelemetry::global;
use opentelemetry_otlp::{
    ExporterBuildError, SpanExporter, WithExportConfig as _, WithTonicConfig as _,
    tonic_types::transport::ClientTlsConfig,
};
use opentelemetry_sdk::{Resource, propagation::TraceContextPropagator, trace::SdkTracerProvider};
use tracing::Subscriber;
use tracing_subscriber::{Layer, registry::LookupSpan};

use crate::OtlpConfig;

pub(crate) fn provider(
    config: &OtlpConfig,
    service_name: &'static str,
) -> Result<SdkTracerProvider, Report<ExporterBuildError>> {
    let mut exporter = SpanExporter::builder().with_tonic();

    if let Some(endpoint) = &config.endpoint {
        exporter = exporter.with_endpoint(endpoint);

        // TODO: Properly check for `OTEL_EXPORTER_*` variables
        //  see https://linear.app/hash/issue/H-5070/modernize-rust-opentelemetry-traces-module-to-be-fully-standard
        if endpoint.starts_with("https://") {
            exporter = exporter.with_tls_config(ClientTlsConfig::new().with_enabled_roots());
        }
    }

    Ok(SdkTracerProvider::builder()
        .with_resource(Resource::builder().with_service_name(service_name).build())
        .with_batch_exporter(exporter.build()?)
        .build())
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
