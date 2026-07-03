//! Benchmarks for the embedding k-means module.
//!
//! Two groups:
//!
//! * `embedding/kernel/*` — single-threaded SIMD micro-kernels, measured in retired instructions
//!   via Apple PMCs (near-deterministic; requires root on macOS) with an automatic wall-clock
//!   fallback on other platforms.
//! * `embedding/cluster/*` — end-to-end [`cluster`] runs. Always wall-clock, because the work is
//!   spread across the rayon pool and per-thread instruction counts would only see the calling
//!   thread.
//!
//! [`cluster`]: hash_graph_store::embedding::clustering::cluster
#![expect(
    unsafe_code,
    clippy::float_arithmetic,
    clippy::indexing_slicing,
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    clippy::min_ident_chars,
    clippy::significant_drop_tightening,
    reason = "benchmarks exercise the unsafe SIMD kernels directly and build float test data; \
              single-char idents (k, n, d) are standard mathematical notation for clustering; the \
              drop-tightening warning originates inside `criterion_group!`"
)]

use core::hint::black_box;

use codspeed_criterion_compat::{
    BenchmarkId, Criterion, criterion_group, criterion_main, measurement::Measurement,
};
use hash_graph_store::embedding::{
    clustering::{Config, cluster},
    dimension::Dimension,
    kernel,
};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

/// Uniform random values in `[-1, 1)`.
fn random_vec(len: usize, seed: u64) -> Vec<f32> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    core::iter::repeat_with(|| rng.random_range(-1.0..1.0))
        .take(len)
        .collect()
}

/// Uniform random values in `[0.1, 1)`, guaranteed positive so repeated
/// accumulation saturates at infinity instead of producing NaNs.
fn random_positive_vec(len: usize, seed: u64) -> Vec<f32> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    core::iter::repeat_with(|| rng.random_range(0.1..1.0))
        .take(len)
        .collect()
}

/// Well-separated blobs: `k` clusters of `points_per_cluster` points in
/// `d`-dimensional space, each with a dominant axis. Mirrors the shape of
/// real embedding workloads better than uniform noise: the fit converges
/// instead of always exhausting `max_iters`.
fn blobs(points_per_cluster: usize, k: usize, d: usize, seed: u64) -> Vec<f32> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    let mut data = vec![0.0_f32; points_per_cluster * k * d];

    for (index, row) in data.chunks_exact_mut(d).enumerate() {
        let axis = (index / points_per_cluster) % d;
        row[axis] = 10.0;
        for value in row.iter_mut() {
            *value += rng.random_range(-0.01..0.01);
        }
    }

    data
}

const KERNEL_DIMS: &[usize] = &[256, 1536, 3072];

fn bench_dot<M: Measurement>(criterion: &mut Criterion<M>) {
    let mut group = criterion.benchmark_group("embedding/kernel/dot");

    for &d in KERNEL_DIMS {
        let lhs = random_vec(d, 1);
        let rhs = random_vec(d, 2);

        group.bench_with_input(BenchmarkId::from_parameter(d), &d, |bencher, _| {
            // SAFETY: both slices have length `d`, a multiple of 8.
            bencher.iter(|| unsafe { kernel::dot(black_box(&lhs), black_box(&rhs)) });
        });
    }

    group.finish();
}

fn bench_add_scaled_into<M: Measurement>(criterion: &mut Criterion<M>) {
    let mut group = criterion.benchmark_group("embedding/kernel/add_scaled_into");

    for &d in KERNEL_DIMS {
        let src = random_positive_vec(d, 3);
        let mut dst = random_positive_vec(d, 4);

        group.bench_with_input(BenchmarkId::from_parameter(d), &d, |bencher, _| {
            // SAFETY: both slices have length `d`, a multiple of 8.
            bencher.iter(|| unsafe {
                kernel::add_scaled_into(black_box(&mut dst), black_box(&src), black_box(0.5));
            });
        });
    }

    group.finish();
}

fn bench_micro_4x2<M: Measurement>(criterion: &mut Criterion<M>) {
    let mut group = criterion.benchmark_group("embedding/kernel/micro_4x2");

    for &d in KERNEL_DIMS {
        let points: Vec<Vec<f32>> = (0..4).map(|seed| random_vec(d, 10 + seed)).collect();
        let c0 = random_vec(d, 20);
        let c1 = random_vec(d, 21);

        group.bench_with_input(BenchmarkId::from_parameter(d), &d, |bencher, _| {
            // SAFETY: all six slices have length `d`, a multiple of 8.
            bencher.iter(|| unsafe {
                kernel::micro_4x2(
                    black_box(&points[0]),
                    black_box(&points[1]),
                    black_box(&points[2]),
                    black_box(&points[3]),
                    black_box(&c0),
                    black_box(&c1),
                )
            });
        });
    }

    group.finish();
}

macro_rules! nz {
    ($expr:expr) => {
        const { ::core::num::NonZero::new($expr).unwrap() }
    };
}

fn bench_nearest4<M: Measurement>(criterion: &mut Criterion<M>) {
    let mut group = criterion.benchmark_group("embedding/kernel/nearest4");

    // k = 15 exercises the odd-k remainder path.
    for &(d, k) in &[
        (256, nz!(15)),
        (256, nz!(16)),
        (256, nz!(64)),
        (1536, nz!(16)),
        (3072, nz!(16)),
    ] {
        let points: Vec<Vec<f32>> = (0..4).map(|seed| random_vec(d, 30 + seed)).collect();
        let centroids = random_vec(k.get() * d, 40);

        group.bench_with_input(
            BenchmarkId::new(format!("d{d}"), k),
            &(d, k),
            |bencher, _| {
                // SAFETY: point slices have length `d` (multiple of 8),
                // centroids has length `k * d`, and `k > 0`.
                bencher.iter(|| unsafe {
                    kernel::nearest4(
                        black_box(&points[0]),
                        black_box(&points[1]),
                        black_box(&points[2]),
                        black_box(&points[3]),
                        black_box(&centroids),
                        black_box(k),
                        black_box(d),
                    )
                });
            },
        );
    }

    group.finish();
}

fn bench_cluster(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("embedding/cluster");
    group.sample_size(10);

    let dimension = Dimension::new(256).expect("256 is a positive multiple of 8");

    // (n, k): n = 10k exercises the subsampled fit (m = 8192) plus the
    // full-data refinement; n = 50k shifts the weight onto the full-data
    // passes.
    for &(n, k) in &[
        (10_000_usize, 8_u16),
        (10_000, 32),
        (10_000, 128),
        (50_000, 32),
    ] {
        let data = blobs(n / usize::from(k), usize::from(k), 256, 7);
        let config = Config::for_k_with_seed(k, 42);

        group.bench_with_input(
            BenchmarkId::new(format!("n{n}_d256"), k),
            &(n, k),
            |bencher, _| {
                bencher.iter(|| cluster(black_box(&data), black_box(dimension), &config));
            },
        );
    }

    group.finish();
}

fn kernel_measurement() -> Criterion<darwin_kperf_criterion::HardwareCounter> {
    use core::time::Duration;

    // Retired instructions on Apple Silicon (needs root there), wall-clock
    // fallback everywhere else. Instruction counts are near-deterministic,
    // so short windows and small samples suffice.
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
    name = kernel;
    config = kernel_measurement();
    targets = bench_dot, bench_add_scaled_into, bench_micro_4x2, bench_nearest4
);
criterion_group!(
    name = clustering;
    config = Criterion::default();
    targets = bench_cluster
);
criterion_main!(kernel, clustering);
