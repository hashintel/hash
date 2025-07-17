use error_stack::Report;
use opentelemetry_otlp::{ExporterBuildError, MetricExporter, WithExportConfig as _};
use opentelemetry_sdk::{Resource, metrics::SdkMeterProvider};

use crate::OtlpConfig;

pub(crate) fn provider(
    config: &OtlpConfig,
    service_name: &'static str,
) -> Result<Option<SdkMeterProvider>, Report<ExporterBuildError>> {
    let Some(endpoint) = config.endpoint.as_deref() else {
        return Ok(None);
    };

    Ok(Some(
        SdkMeterProvider::builder()
            .with_resource(Resource::builder().with_service_name(service_name).build())
            .with_periodic_exporter(
                MetricExporter::builder()
                    .with_tonic()
                    .with_endpoint(endpoint)
                    .build()?,
            )
            .build(),
    ))
}
