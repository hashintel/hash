use core::time::Duration;

use opentelemetry::{global, KeyValue};
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{
    propagation::TraceContextPropagator,
    trace::{RandomIdGenerator, Sampler},
    Resource,
};
use tokio::runtime::Handle;
use tracing::Subscriber;
use tracing_subscriber::{registry::LookupSpan, Layer};

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

pub type OtlpLayer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
= impl Layer<S>;

/// Creates a layer which connects to the `OpenTelemetry` collector.
///
/// # Panics
///
/// Panics if the `OpenTelemetry` configuration is invalid.
#[must_use]
pub fn layer<S>(config: &OpenTelemetryConfig, handle: &Handle) -> OtlpLayer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    // pipeline spawns a background task to export telemetry data.
    // The handle is used so that we can spawn the task on the correct runtime.
    let _guard = handle.enter();

    let endpoint = config.endpoint.as_deref()?;

    // Allow correlating trace IDs
    global::set_text_map_propagator(TraceContextPropagator::new());
    // If we need to set any tokens in the header for the tracing collector, this would be the place
    // we do so.
    let map = opentelemetry_otlp::TonicConfig::default()
        .metadata
        .unwrap_or_default();

    let pipeline = opentelemetry_otlp::new_exporter()
        .tonic()
        .with_endpoint(endpoint)
        .with_timeout(OPENTELEMETRY_TIMEOUT_DURATION)
        .with_metadata(map);

    // Configure sampler args with the following environment variables:
    //   - OTEL_TRACES_SAMPLER_ARG
    //   - OTEL_TRACES_SAMPLER
    //
    // Configure span options with the following environment variables:
    //   - OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT
    //   - OTEL_SPAN_EVENT_COUNT_LIMIT
    //   - OTEL_SPAN_LINK_COUNT_LIMIT
    let trace_config = opentelemetry_sdk::trace::config()
        .with_sampler(Sampler::ParentBased(Box::new(Sampler::TraceIdRatioBased(
            0.1,
        ))))
        .with_id_generator(RandomIdGenerator::default())
        .with_resource(Resource::new(vec![KeyValue::new("service.name", "graph")]));

    // The tracer batch sends traces asynchronously instead of per-span.
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(pipeline)
        .with_trace_config(trace_config)
        .install_batch(opentelemetry_sdk::runtime::Tokio)
        .expect("failed to create OTLP tracer, check configuration values");

    Some(tracing_opentelemetry::layer().with_tracer(tracer))
}
