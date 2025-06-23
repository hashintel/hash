/// Arguments for configuring the logging setup
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args), clap(next_help_heading = Some("Open Telemetry")))]
#[expect(
    clippy::struct_field_names,
    reason = "This is a configuration struct, field names are kept short for brevity"
)]
pub struct OtlpConfig {
    /// The OpenTelemetry endpoint for sending traces.
    #[cfg_attr(
        feature = "clap",
        clap(long = "otlp-traces-endpoint", default_value = None, env = "HASH_GRAPH_OTLP_TRACE_ENDPOINT")
    )]
    pub traces_endpoint: Option<String>,

    /// The OpenTelemetry endpoint for sending logs.
    #[cfg_attr(
        feature = "clap",
        clap(long = "otlp-logs-endpoint", default_value = None, env = "HASH_GRAPH_OTLP_LOGS_ENDPOINT")
    )]
    pub logs_endpoint: Option<String>,

    /// The OpenTelemetry endpoint for sending metrics.
    #[cfg_attr(
        feature = "clap",
        clap(long = "otlp-metrics-endpoint", default_value = None, env = "HASH_GRAPH_OTLP_METRICS_ENDPOINT")
    )]
    pub metrics_endpoint: Option<String>,
}
