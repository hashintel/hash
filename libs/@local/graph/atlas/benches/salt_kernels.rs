//! Hardware-counter benchmarks for single-threaded SALT kernels.
//!
//! An independent scalar oracle validates the fixture before Criterion measures
//! retired instructions on Apple hardware or wall time on fallback platforms.
#![expect(
    clippy::float_arithmetic,
    clippy::indexing_slicing,
    clippy::significant_drop_tightening,
    reason = "benchmark setup validates floating-point quality and Criterion owns group drops"
)]

use core::{hint::black_box, time::Duration};

use codspeed_criterion_compat::{
    Criterion, Throughput, criterion_group, criterion_main, measurement::Measurement,
};
use hash_graph_atlas::salt_benchmark::{PROJECTOR_WIDTH, PrefixFixture};

fn bench_prefix<M: Measurement>(criterion: &mut Criterion<M>) {
    let fixture = PrefixFixture::new();
    let mut oracle_output = [0.0; PROJECTOR_WIDTH];
    let _ = fixture.normalize(&mut oracle_output);
    assert!(
        fixture.maximum_error(&oracle_output) <= 1.0e-7,
        "production SIMD transform must match the scalar quality oracle"
    );

    let mut group = criterion.benchmark_group("salt/kernel/projector-prefix");
    group.throughput(Throughput::Elements(1));
    group.bench_function("d3072-to-d512", |bencher| {
        let mut output = [0.0; PROJECTOR_WIDTH];
        bencher.iter(|| {
            black_box(fixture.normalize(black_box(&mut output)));
            black_box(&output);
        });
    });
    group.finish();
}

fn hardware_counter() -> Criterion<darwin_kperf_criterion::HardwareCounter> {
    Criterion::default()
        .with_measurement(
            darwin_kperf_criterion::HardwareCounter::instructions()
                .expect("instruction counting requires root on Apple Silicon (run under sudo)"),
        )
        .warm_up_time(Duration::from_millis(500))
        .measurement_time(Duration::from_secs(1))
        .sample_size(20)
}

criterion_group!(
    name = kernels;
    config = hardware_counter();
    targets = bench_prefix
);
criterion_main!(kernels);
