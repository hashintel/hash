//! Workspace outcomes exported through the application's OpenTelemetry meter provider.

use core::{future::poll_fn, pin::pin, task::Poll};
use std::fs;

use hash_integrations_engine::{
    ByteSize, OpenError, SnapshotError, StatementError, Workspace, WorkspaceConfig,
};
use opentelemetry::{KeyValue, global};
use opentelemetry_sdk::metrics::{
    InMemoryMetricExporter, SdkMeterProvider,
    data::{
        AggregatedMetrics, HistogramDataPoint, Metric, MetricData, ResourceMetrics, ScopeMetrics,
        SumDataPoint,
    },
};
use pretty_assertions::assert_eq;
use tempfile::TempDir;

fn metric<'a>(resources: &'a [ResourceMetrics], name: &str) -> &'a Metric {
    resources
        .iter()
        .flat_map(ResourceMetrics::scope_metrics)
        .flat_map(ScopeMetrics::metrics)
        .find(|metric| metric.name() == name)
        .expect("the workspace should export the metric")
}

fn counter(resources: &[ResourceMetrics], name: &str, attributes: &[KeyValue]) -> u64 {
    let AggregatedMetrics::U64(MetricData::Sum(sum)) = metric(resources, name).data() else {
        panic!("the metric should be an unsigned counter");
    };
    sum.data_points()
        .filter(|point| {
            attributes
                .iter()
                .all(|expected| point.attributes().any(|actual| actual == expected))
        })
        .map(SumDataPoint::value)
        .sum()
}

async fn exercise_workspace() -> u64 {
    let directory = TempDir::new().expect("the temporary directory should be created");
    let path = directory.path().join("workspace.duckdb");
    let workspace = Workspace::open(
        path.clone(),
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(64 * 1024 * 1024)),
            ..WorkspaceConfig::default()
        },
    )
    .await
    .expect("the workspace should open");
    let report = Workspace::open(path, WorkspaceConfig::default())
        .await
        .expect_err("the workspace lock should prevent a second open");
    assert!(
        matches!(report.current_context(), OpenError::Locked { .. }),
        "the second open should fail on the lock"
    );
    workspace
        .create_table("items".into(), "SELECT * FROM range(3)".into())
        .await
        .expect("the table should be created");
    workspace
        .query("SELECT * FROM items LIMIT 2".into())
        .await
        .expect("the query should return two rows");
    let report = workspace
        .query("SELECT * FROM missing_table".into())
        .await
        .expect_err("the missing table should fail the query");
    assert!(
        matches!(
            report.current_context(),
            StatementError::InvalidQuery { .. }
        ),
        "the missing table should produce a query error"
    );

    let snapshot_path = directory.path().join("snapshot.duckdb");
    workspace
        .snapshot(snapshot_path.clone())
        .await
        .expect("the snapshot should be published");
    let report = workspace
        .snapshot(directory.path().join("missing/snapshot.duckdb"))
        .await
        .expect_err("the absent directory should fail the snapshot");
    assert!(
        matches!(report.current_context(), SnapshotError::Write { .. }),
        "the absent directory should produce a write error"
    );

    {
        let mut query = pin!(workspace.query("SELECT sum(i) FROM range(10000000000) t(i)".into()));
        assert!(
            poll_fn(|context| Poll::Ready(query.as_mut().poll(context).is_pending())).await,
            "the long query should still be pending"
        );
    }
    workspace.close().await.expect("the workspace should close");
    fs::metadata(snapshot_path)
        .expect("the snapshot should exist")
        .len()
}

#[tokio::test]
async fn workspace_observed_outcomes() {
    let exporter = InMemoryMetricExporter::default();
    let provider = SdkMeterProvider::builder()
        .with_periodic_exporter(exporter.clone())
        .build();
    global::set_meter_provider(provider.clone());

    let snapshot_bytes = exercise_workspace().await;
    provider.force_flush().expect("the metrics should flush");
    let recorded = exporter
        .get_finished_metrics()
        .expect("the metrics should be exported");

    for (operation, outcome, expected) in [
        ("open", "success", 1),
        ("open", "failure", 1),
        ("create_table", "success", 1),
        ("query", "success", 1),
        ("query", "failure", 1),
        ("snapshot", "success", 1),
        ("snapshot", "failure", 1),
        ("close", "success", 1),
    ] {
        assert_eq!(
            counter(
                &recorded,
                "integrations.workspace.requests",
                &[
                    KeyValue::new("operation", operation),
                    KeyValue::new("outcome", outcome),
                ]
            ),
            expected,
            "each observed {operation} {outcome} should be counted once"
        );
    }
    let cancelled = ["cancelled", "skipped"]
        .into_iter()
        .map(|outcome| {
            counter(
                &recorded,
                "integrations.workspace.requests",
                &[
                    KeyValue::new("operation", "query"),
                    KeyValue::new("outcome", outcome),
                ],
            )
        })
        .sum::<u64>();
    assert_eq!(
        cancelled, 1,
        "the dropped query should be cancelled or skipped"
    );
    for (operation, expected) in [("query", 2), ("create_table", 3)] {
        assert_eq!(
            counter(
                &recorded,
                "integrations.workspace.rows",
                &[KeyValue::new("operation", operation)]
            ),
            expected,
            "observed {operation} rows should be counted"
        );
    }
    assert_eq!(
        counter(&recorded, "integrations.workspace.snapshot.bytes", &[]),
        snapshot_bytes,
        "only successfully published snapshot bytes should be counted"
    );
    let AggregatedMetrics::U64(MetricData::Histogram(disk)) =
        metric(&recorded, "integrations.workspace.disk.usage").data()
    else {
        panic!("disk usage should be recorded as a histogram");
    };
    assert!(
        disk.data_points().any(|point| point.sum() > 0),
        "disk checks should report the observed file sizes"
    );
    let AggregatedMetrics::F64(MetricData::Histogram(duration)) =
        metric(&recorded, "integrations.workspace.duration").data()
    else {
        panic!("request duration should be recorded as a histogram");
    };
    assert_eq!(
        duration
            .data_points()
            .map(HistogramDataPoint::count)
            .sum::<u64>(),
        9,
        "each observed request should have an execution duration"
    );
    provider
        .shutdown()
        .expect("the meter provider should shut down");
}
