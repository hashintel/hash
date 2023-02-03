use std::{io, time::Duration};

use opentelemetry::{
    global,
    sdk::{
        propagation::TraceContextPropagator,
        trace::{RandomIdGenerator, Sampler, Tracer},
        Resource,
    },
    KeyValue,
};
use opentelemetry_otlp::WithExportConfig;
use tonic::metadata::MetadataMap;
use tracing::{Event, Subscriber};
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::{
    filter::{Directive, LevelFilter},
    fmt::{
        self,
        format::{Format, JsonFields, Writer},
        time::FormatTime,
        writer::BoxMakeWriter,
        FmtContext, FormatEvent, FormatFields,
    },
    layer::{Layered, SubscriberExt},
    registry::LookupSpan,
    util::{SubscriberInitExt, TryInitError},
    EnvFilter, Registry,
};

use crate::logging::args::{LogFormat, LoggingArgs};

const OPENTELEMETRY_TIMEOUT_DURATION: Duration = Duration::from_secs(5);

enum OutputFormatter<T> {
    Full(Format<fmt::format::Full, T>),
    Pretty(Format<fmt::format::Pretty, T>),
    Json(Format<fmt::format::Json, T>),
    Compact(Format<fmt::format::Compact, T>),
}

impl<S, N, T> FormatEvent<S, N> for OutputFormatter<T>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
    T: FormatTime,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        writer: Writer<'_>,
        event: &Event<'_>,
    ) -> std::fmt::Result {
        match self {
            Self::Full(fmt) => fmt.format_event(ctx, writer, event),
            Self::Pretty(fmt) => fmt.format_event(ctx, writer, event),
            Self::Json(fmt) => fmt.format_event(ctx, writer, event),
            Self::Compact(fmt) => fmt.format_event(ctx, writer, event),
        }
    }
}

fn configure_opentelemetry_layer(
    otlp_endpoint: &str,
) -> OpenTelemetryLayer<Layered<EnvFilter, Registry>, Tracer> {
    // Allow correlating trace IDs
    global::set_text_map_propagator(TraceContextPropagator::new());
    // If we need to set any tokens in the header for the tracing collector, this would be the place
    // we do so.
    let map = MetadataMap::new();

    let pipeline = opentelemetry_otlp::new_exporter()
        .tonic()
        .with_endpoint(otlp_endpoint)
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
    let trace_config = opentelemetry::sdk::trace::config()
        .with_sampler(Sampler::AlwaysOn)
        .with_id_generator(RandomIdGenerator::default())
        .with_resource(Resource::new(vec![KeyValue::new("service.name", "graph")]));

    // The tracer batch sends traces asynchronously instead of per-span.
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(pipeline)
        .with_trace_config(trace_config)
        .install_batch(opentelemetry::runtime::Tokio)
        .expect("failed to create OTLP tracer, check configuration values");

    tracing_opentelemetry::layer().with_tracer(tracer)
}

/// Initialize the `tracing` logging setup.
///
/// # Errors
///
/// - [`TryInitError`], if initializing the [`tracing_subscriber::Registry`] fails.
pub fn init_logger(log_args: &LoggingArgs) -> Result<impl Drop, TryInitError> {
    let LoggingArgs {
        log_format,
        log_folder,
        log_level,
        log_file_prefix,
        otlp_endpoint,
    } = log_args;

    let filter = log_level.map_or_else(
        || {
            std::env::var("RUST_LOG").map_or_else(
                |_| {
                    if cfg!(debug_assertions) {
                        EnvFilter::default().add_directive(Directive::from(LevelFilter::DEBUG))
                    } else {
                        EnvFilter::default().add_directive(Directive::from(LevelFilter::WARN))
                    }
                },
                EnvFilter::new,
            )
        },
        |log_level| EnvFilter::default().add_directive(Directive::from(log_level)),
    );

    let formatter = fmt::format().with_target(true);
    let output_format = match log_format {
        LogFormat::Full => OutputFormatter::Full(formatter.clone()),
        LogFormat::Pretty => OutputFormatter::Pretty(formatter.clone().pretty()),
        LogFormat::Json => OutputFormatter::Json(formatter.clone().json()),
        LogFormat::Compact => OutputFormatter::Compact(formatter.clone().compact()),
    };

    let error_layer = tracing_error::ErrorLayer::default();

    let output_writer = BoxMakeWriter::new(io::stderr);

    // Because of how the Registry and Layer interface is designed, we can't just have one layer,
    // as they have different types. We also can't box them as it requires Sized. However,
    // Option<Layer> implements the Layer trait so we can just provide None for one and Some
    // for the other
    let (output_layer, json_output_layer) = match log_format {
        LogFormat::Json => (
            None,
            Some(
                fmt::layer()
                    .event_format(output_format)
                    .with_ansi(true)
                    .fmt_fields(JsonFields::new())
                    .with_writer(output_writer),
            ),
        ),
        _ => (
            Some(
                fmt::layer()
                    .event_format(output_format)
                    .with_ansi(true)
                    .with_writer(output_writer),
            ),
            None,
        ),
    };

    let json_file_appender =
        tracing_appender::rolling::never(log_folder, format!("{log_file_prefix}.jsonl"));
    let (non_blocking, json_file_guard) = tracing_appender::non_blocking(json_file_appender);

    let json_file_layer = fmt::layer()
        .event_format(formatter.json())
        .fmt_fields(JsonFields::new())
        .with_writer(non_blocking);

    let opentelemetry_layer = otlp_endpoint.as_deref().map(configure_opentelemetry_layer);

    tracing_subscriber::registry()
        .with(filter)
        .with(opentelemetry_layer)
        .with(output_layer)
        .with(json_output_layer)
        .with(json_file_layer)
        .with(error_layer)
        .try_init()?;

    Ok(json_file_guard)
}
