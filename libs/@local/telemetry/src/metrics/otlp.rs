use error_stack::Report;
use opentelemetry_otlp::{ExporterBuildError, MetricExporter, WithExportConfig as _};
use opentelemetry_sdk::{Resource, metrics::SdkMeterProvider};

use crate::OtlpConfig;

pub(crate) fn provider(
    config: &OtlpConfig,
) -> Result<Option<SdkMeterProvider>, Report<ExporterBuildError>> {
    let Some(endpoint) = config.metrics_endpoint.as_deref() else {
        return Ok(None);
    };

    Ok(Some(
        SdkMeterProvider::builder()
            .with_resource(Resource::builder().with_service_name("graph").build())
            .with_periodic_exporter(
                MetricExporter::builder()
                    .with_tonic()
                    .with_endpoint(endpoint)
                    .build()?,
            )
            .build(),
    ))
}
