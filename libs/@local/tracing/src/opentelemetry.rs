use core::time::Duration;

use error_stack::Report;
use opentelemetry::{global, trace::TracerProvider as _};
use opentelemetry_otlp::{ExporterBuildError, SpanExporter, WithExportConfig as _};
use opentelemetry_sdk::{
    Resource,
    propagation::TraceContextPropagator,
    trace::{self, RandomIdGenerator, Sampler},
};
use tokio::runtime::Handle;
use tracing::Subscriber;
use tracing_subscriber::{Layer, registry::LookupSpan};

/// Arguments for configuring the logging setup
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args), clap(next_help_heading = Some("Open Telemetry")))]
pub struct OpenTelemetryConfig {
    /// The OpenTelemetry protocol endpoint for sending traces.
    #[cfg_attr(
        feature = "clap",
        clap(long = "otlp-endpoint", default_value = None, env = "HASH_GRAPH_OTLP_ENDPOINT", global = true)
    )]
    pub endpoint: Option<String>,
}

const OPENTELEMETRY_TIMEOUT_DURATION: Duration = Duration::from_secs(5);

/// Creates a layer which connects to the `OpenTelemetry` collector.
///
/// # Errors
///
/// Errors if the `OpenTelemetry` configuration is invalid.
#[expect(
    clippy::min_ident_chars,
    reason = "False positive lint on generic bounds"
)]
pub fn layer<S>(
    config: &OpenTelemetryConfig,
    handle: &Handle,
) -> Result<impl Layer<S> + use<S>, Report<ExporterBuildError>>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    // pipeline spawns a background task to export telemetry data.
    // The handle is used so that we can spawn the task on the correct runtime.
    let _guard = handle.enter();

    let Some(endpoint) = config.endpoint.as_deref() else {
        return Ok(None);
    };

    // Allow correlating trace IDs
    global::set_text_map_propagator(TraceContextPropagator::new());

    // Configure sampler args with the following environment variables:
    //   - OTEL_TRACES_SAMPLER_ARG
    //   - OTEL_TRACES_SAMPLER
    //
    // Configure span options with the following environment variables:
    //   - OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT
    //   - OTEL_SPAN_EVENT_COUNT_LIMIT
    //   - OTEL_SPAN_LINK_COUNT_LIMIT
    let tracer = trace::SdkTracerProvider::builder()
        .with_batch_exporter(
            SpanExporter::builder()
                .with_tonic()
                .with_endpoint(endpoint)
                .with_timeout(OPENTELEMETRY_TIMEOUT_DURATION)
                .build()?,
        )
        .with_sampler(Sampler::ParentBased(Box::new(Sampler::TraceIdRatioBased(
            0.1,
        ))))
        .with_id_generator(RandomIdGenerator::default())
        .with_resource(Resource::builder().with_service_name("graph").build())
        .build()
        .tracer("graph");

    Ok(Some(tracing_opentelemetry::layer().with_tracer(tracer)))
}
