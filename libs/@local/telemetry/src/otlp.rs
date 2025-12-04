/// Arguments for configuring the OpenTelemetry setup.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args), clap(next_help_heading = Some("Open Telemetry")))]
pub struct OtlpConfig {
    /// The OpenTelemetry endpoint for sending traces, logs, and metrics.
    #[cfg_attr(
        feature = "clap",
        clap(long = "otlp-endpoint", default_value = None, env = "HASH_OTLP_ENDPOINT")
    )]
    pub endpoint: Option<String>,
}
