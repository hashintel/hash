use error_stack::Report;
use opentelemetry_otlp::{
    ExporterBuildError, MetricExporter, WithExportConfig as _, WithTonicConfig as _,
    tonic_types::transport::ClientTlsConfig,
};
use opentelemetry_sdk::{Resource, metrics::SdkMeterProvider};

use crate::OtlpConfig;

pub(crate) fn provider(
    config: &OtlpConfig,
    service_name: &'static str,
) -> Result<Option<SdkMeterProvider>, Report<ExporterBuildError>> {
    let Some(endpoint) = config.endpoint.as_deref() else {
        return Ok(None);
    };

    let mut exporter = MetricExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint);

    // TODO: Properly check for `OTEL_EXPORTER_*` variables
    //  see https://linear.app/hash/issue/H-5071/modernize-rust-opentelemetry-metrics-module-to-be-fully-standard
    if endpoint.starts_with("https://") {
        exporter = exporter.with_tls_config(ClientTlsConfig::new().with_enabled_roots());
    }

    Ok(Some(
        SdkMeterProvider::builder()
            .with_resource(Resource::builder().with_service_name(service_name).build())
            .with_periodic_exporter(exporter.build()?)
            .build(),
    ))
}
