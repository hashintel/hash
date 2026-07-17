//! Quality-gated SALT stage wall-time benchmarks.
//!
//! Numerical or recall assertions run before timing. Criterion then tracks
//! wall time for parallel graph construction.
#![expect(
    clippy::significant_drop_tightening,
    reason = "Criterion owns benchmark-group drops"
)]

use core::hint::black_box;

use codspeed_criterion_compat::{
    BenchmarkId, Criterion, Throughput, criterion_group, criterion_main,
};
use hash_graph_atlas::salt_benchmark::{
    ANALYTIC_PERSISTENCE_FLOOR, AnalyticFixture, SemanticGraphFixture,
};

fn bench_semantic_graph(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("salt/quality-gated/semantic-graph");
    for rows in [2_048, 8_192] {
        let fixture = SemanticGraphFixture::new(rows);
        assert!(
            fixture.recall() >= 0.89,
            "timed ANN fixture must satisfy the production recall gate"
        );
        group.throughput(Throughput::Elements(
            u64::try_from(fixture.rows()).expect("benchmark row count should fit u64"),
        ));
        group.bench_with_input(BenchmarkId::from_parameter(rows), &rows, |bencher, _| {
            bencher.iter(|| black_box(fixture.build_graph()));
        });
    }
    group.finish();
}

fn bench_analytics(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("salt/quality-gated/analytics");
    for rows in [2_048, 8_192] {
        let fixture = AnalyticFixture::new(rows);
        let quality = fixture.build_analytics();
        assert!(quality.persistent_leaves >= 3);
        assert!(quality.regions >= 3);
        assert!(quality.normalized_persistence >= ANALYTIC_PERSISTENCE_FLOOR);
        group.throughput(Throughput::Elements(
            u64::try_from(fixture.rows()).expect("benchmark row count should fit u64"),
        ));
        group.bench_with_input(BenchmarkId::from_parameter(rows), &rows, |bencher, _| {
            bencher.iter(|| black_box(fixture.build_analytics()));
        });
    }
    group.finish();
}

criterion_group!(
    name = quality_gated_stages;
    config = Criterion::default();
    targets = bench_semantic_graph, bench_analytics
);
criterion_main!(quality_gated_stages);
