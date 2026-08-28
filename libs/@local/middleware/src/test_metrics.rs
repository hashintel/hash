//! Metric assertions for the middleware tests.

use alloc::collections::BTreeSet;

use opentelemetry::{KeyValue, metrics::Meter};
use opentelemetry_sdk::metrics::{
    InMemoryMetricExporter, SdkMeterProvider,
    data::{
        AggregatedMetrics, GaugeDataPoint, HistogramDataPoint, Metric, MetricData, ResourceMetrics,
        ScopeMetrics, SumDataPoint,
    },
};

/// A meter whose provider has no reader, so it records nothing.
pub(crate) fn noop_meter() -> Meter {
    use opentelemetry::metrics::MeterProvider as _;

    SdkMeterProvider::builder().build().meter("test")
}

/// A metrics pipeline with an in-memory reader, so a test can read the instruments back.
pub(crate) struct RecordedMetrics {
    exporter: InMemoryMetricExporter,
    provider: SdkMeterProvider,
}

fn carries(point_attributes: &[&KeyValue], expected: &[(&str, &str)]) -> bool {
    expected.iter().all(|(key, value)| {
        point_attributes
            .iter()
            .any(|attribute| attribute.key.as_str() == *key && attribute.value.as_str() == *value)
    })
}

impl RecordedMetrics {
    pub(crate) fn new() -> Self {
        let exporter = InMemoryMetricExporter::default();
        let provider = SdkMeterProvider::builder()
            .with_periodic_exporter(exporter.clone())
            .build();
        Self { exporter, provider }
    }

    pub(crate) fn meter(&self) -> Meter {
        use opentelemetry::metrics::MeterProvider as _;

        self.provider.meter("test")
    }

    /// Reads the instrument named `name` off a fresh export.
    fn read<T>(&self, name: &str, extract: impl Fn(&Metric) -> Option<T>) -> Option<T> {
        self.provider
            .force_flush()
            .expect("the provider should flush");
        let exports = self
            .exporter
            .get_finished_metrics()
            .expect("the exporter should hand out its exports");
        // The instruments aggregate cumulatively, so the last export carries the current state.
        exports
            .last()
            .into_iter()
            .flat_map(ResourceMetrics::scope_metrics)
            .flat_map(ScopeMetrics::metrics)
            .filter(|metric| metric.name() == name)
            .find_map(extract)
    }

    /// Returns the counter's total across every data point carrying `attributes`, zero where
    /// nothing was recorded. A misspelled instrument name also reads zero.
    pub(crate) fn counter(&self, name: &str, attributes: &[(&str, &str)]) -> u64 {
        self.read(name, |metric| {
            let AggregatedMetrics::U64(MetricData::Sum(sum)) = metric.data() else {
                panic!("`{name}` should be a `u64` counter");
            };
            Some(
                sum.data_points()
                    .filter(|point| carries(&point.attributes().collect::<Vec<_>>(), attributes))
                    .map(SumDataPoint::value)
                    .sum(),
            )
        })
        .unwrap_or(0)
    }

    /// Returns the attribute keys of the counter's data points.
    pub(crate) fn counter_attribute_keys(&self, name: &str) -> BTreeSet<String> {
        self.read(name, |metric| {
            let AggregatedMetrics::U64(MetricData::Sum(sum)) = metric.data() else {
                panic!("`{name}` should be a `u64` counter");
            };
            Some(
                sum.data_points()
                    .flat_map(SumDataPoint::attributes)
                    .map(|attribute| attribute.key.as_str().to_owned())
                    .collect(),
            )
        })
        .unwrap_or_default()
    }

    /// Returns how many values the histogram recorded at `attributes`, zero where none were.
    pub(crate) fn histogram_count(&self, name: &str, attributes: &[(&str, &str)]) -> u64 {
        self.read(name, |metric| {
            let AggregatedMetrics::F64(MetricData::Histogram(histogram)) = metric.data() else {
                panic!("`{name}` should be an `f64` histogram");
            };
            Some(
                histogram
                    .data_points()
                    .filter(|point| carries(&point.attributes().collect::<Vec<_>>(), attributes))
                    .map(HistogramDataPoint::count)
                    .sum(),
            )
        })
        .unwrap_or(0)
    }

    /// Returns the sum of the values the histogram recorded at `attributes`.
    pub(crate) fn histogram_sum(&self, name: &str, attributes: &[(&str, &str)]) -> f64 {
        self.read(name, |metric| {
            let AggregatedMetrics::F64(MetricData::Histogram(histogram)) = metric.data() else {
                panic!("`{name}` should be an `f64` histogram");
            };
            Some(
                histogram
                    .data_points()
                    .filter(|point| carries(&point.attributes().collect::<Vec<_>>(), attributes))
                    .map(HistogramDataPoint::sum)
                    .sum(),
            )
        })
        .unwrap_or(0.0)
    }

    /// Returns the gauge's value at `attributes`, [`None`] where it was never observed.
    pub(crate) fn gauge(&self, name: &str, attributes: &[(&str, &str)]) -> Option<u64> {
        self.read(name, |metric| {
            let AggregatedMetrics::U64(MetricData::Gauge(gauge)) = metric.data() else {
                panic!("`{name}` should be a `u64` gauge");
            };
            gauge
                .data_points()
                .find(|point| carries(&point.attributes().collect::<Vec<_>>(), attributes))
                .map(GaugeDataPoint::value)
        })
    }
}
