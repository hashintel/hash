//! The scoped initialization must leave the global meter provider alone.
//!
//! A scoped guard that registered its provider globally would shut that provider down on drop,
//! silencing every instrument bound through `opentelemetry::global` for the rest of the process —
//! the setup the Graph benches run, with one global initialization and one scoped guard per
//! scenario.

use hash_telemetry::TelemetryRegistry;
use opentelemetry_sdk::metrics::{
    InMemoryMetricExporter, SdkMeterProvider,
    data::{ResourceMetrics, ScopeMetrics},
};

#[test]
fn scoped_init_leaves_the_global_meter_provider() {
    let exporter = InMemoryMetricExporter::default();
    let sentinel = SdkMeterProvider::builder()
        .with_periodic_exporter(exporter.clone())
        .build();
    opentelemetry::global::set_meter_provider(sentinel.clone());

    drop(
        TelemetryRegistry::default()
            .init()
            .expect("the scoped telemetry should initialize"),
    );

    opentelemetry::global::meter("probe")
        .u64_counter("probe")
        .build()
        .add(1, &[]);
    sentinel
        .force_flush()
        .expect("the sentinel provider should flush");

    let recorded = exporter
        .get_finished_metrics()
        .expect("the exporter should hand out its exports")
        .last()
        .into_iter()
        .flat_map(ResourceMetrics::scope_metrics)
        .flat_map(ScopeMetrics::metrics)
        .any(|metric| metric.name() == "probe");
    assert!(
        recorded,
        "the global provider should still record after a scoped init dropped: a scoped guard must \
         neither replace nor shut down the global registration"
    );
}
