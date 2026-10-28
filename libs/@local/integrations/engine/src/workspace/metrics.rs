use core::time::Duration;

use opentelemetry::{
    KeyValue, global,
    metrics::{Counter, Histogram},
};

/// Records the outcomes observed by workspace threads through the process's meter provider.
#[derive(Clone)]
pub(super) struct Metrics {
    requests: Counter<u64>,
    duration: Histogram<f64>,
    rows: Counter<u64>,
    disk_usage: Histogram<u64>,
    snapshot_bytes: Counter<u64>,
}

impl Metrics {
    pub(super) fn new() -> Self {
        let meter = global::meter("hash-integrations-engine");
        Self {
            requests: meter
                .u64_counter("integrations.workspace.requests")
                .with_description("Workspace requests by operation and outcome")
                .build(),
            duration: meter
                .f64_histogram("integrations.workspace.duration")
                .with_description("Workspace operation execution time")
                .with_unit("s")
                .build(),
            rows: meter
                .u64_counter("integrations.workspace.rows")
                .with_description("Rows read by queries or materialized into tables")
                .build(),
            disk_usage: meter
                .u64_histogram("integrations.workspace.disk.usage")
                .with_description("Workspace file sizes observed during disk-limit checks")
                .with_unit("By")
                .build(),
            snapshot_bytes: meter
                .u64_counter("integrations.workspace.snapshot.bytes")
                .with_description("Bytes written to successfully published workspace snapshots")
                .with_unit("By")
                .build(),
        }
    }

    /// Records a request's outcome and execution time, excluding time in the queue.
    pub(super) fn request(
        &self,
        operation: &'static str,
        outcome: &'static str,
        elapsed: Duration,
    ) {
        let attributes = [
            KeyValue::new("operation", operation),
            KeyValue::new("outcome", outcome),
        ];
        self.requests.add(1, &attributes);
        self.duration.record(elapsed.as_secs_f64(), &attributes);
    }

    /// Counts rows already read or materialized, including work followed by a disk-limit failure.
    pub(super) fn rows(&self, operation: &'static str, count: u64) {
        self.rows
            .add(count, &[KeyValue::new("operation", operation)]);
    }

    pub(super) fn disk_usage(&self, bytes: u64) {
        self.disk_usage.record(bytes, &[]);
    }

    pub(super) fn snapshot(&self, bytes: u64) {
        self.snapshot_bytes.add(bytes, &[]);
    }
}
