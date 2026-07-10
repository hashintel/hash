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
//! [`cluster`]: hash_graph_embeddings::clustering::cluster
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

use core::{hint::black_box, num::NonZero};

use codspeed_criterion_compat::{
    BenchmarkId, Criterion, criterion_group, criterion_main, measurement::Measurement,
};
use hash_graph_embeddings::{
    D256, D1536, D3072, Dimension,
    clustering::{Config, cluster},
    kernel,
};
use rand::{RngExt as _, SeedableRng as _, distr::Uniform};
use rand_xoshiro::Xoshiro256PlusPlus;

macro_rules! nz {
    ($expr:expr) => {
        const { ::core::num::NonZero::new($expr).unwrap() }
    };
}

/// Uniform random values in `[-1, 1)`.
fn random_vec(n: usize, seed: u64) -> Vec<f32> {
    let rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    rng.sample_iter(Uniform::new(-1.0, 1.0).expect("uniform range is non-empty"))
        .take(n)
        .collect()
}

/// Uniform random values in `[0.1, 1)`, guaranteed positive so repeated
/// accumulation saturates at infinity instead of producing NaNs.
fn random_positive_vec(n: usize, seed: u64) -> Vec<f32> {
    let rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    rng.sample_iter(Uniform::new(0.1, 1.0).expect("uniform range is non-empty"))
        .take(n)
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

const KERNEL_DIMS: [Dimension; 3] = [D256, D1536, D3072];

fn bench_dot<M: Measurement>(criterion: &mut Criterion<M>) {
    let mut group = criterion.benchmark_group("kernel/dot");

    for dim in KERNEL_DIMS {
        let lhs = random_vec(dim.get() as usize, 1);
        let rhs = random_vec(dim.get() as usize, 2);

        group.bench_with_input(BenchmarkId::from_parameter(dim), &dim, |bencher, _| {
            // SAFETY: both slices have length `d`, a multiple of 8.
            bencher.iter(|| unsafe { kernel::dot(black_box(&lhs), black_box(&rhs)) });
        });
    }

    group.finish();
}

fn bench_add_scaled_into<M: Measurement>(criterion: &mut Criterion<M>) {
    let mut group = criterion.benchmark_group("kernel/add_scaled_into");

    for dim in KERNEL_DIMS {
        let src = random_positive_vec(dim.get() as usize, 3);
        let mut dst = random_positive_vec(dim.get() as usize, 4);

        group.bench_with_input(BenchmarkId::from_parameter(dim), &dim, |bencher, _| {
            // SAFETY: both slices have length `d`, a multiple of 8.
            bencher.iter(|| unsafe {
                kernel::add_scaled_into(black_box(&mut dst), black_box(&src), black_box(0.5));
            });
        });
    }

    group.finish();
}

fn bench_micro_4x2<M: Measurement>(criterion: &mut Criterion<M>) {
    let mut group = criterion.benchmark_group("kernel/micro_4x2");

    for dim in KERNEL_DIMS {
        let [p0, p1, p2, p3] =
            core::array::from_fn(|index| random_vec(dim.get() as usize, 10 + index as u64));
        let c0 = random_vec(dim.get() as usize, 20);
        let c1 = random_vec(dim.get() as usize, 21);

        group.bench_with_input(BenchmarkId::from_parameter(dim), &dim, |bencher, _| {
            // SAFETY: all six slices have length `d`, a multiple of 8.
            bencher.iter(|| unsafe {
                kernel::micro_4x2(
                    black_box(&p0),
                    black_box(&p1),
                    black_box(&p2),
                    black_box(&p3),
                    black_box(&c0),
                    black_box(&c1),
                )
            });
        });
    }

    group.finish();
}

fn bench_nearest4<M: Measurement>(criterion: &mut Criterion<M>) {
    let mut group = criterion.benchmark_group("kernel/nearest4");

    // k = 15 exercises the odd-k remainder path.
    for &(dim, k) in &[
        (D256, nz!(15)),
        (D256, nz!(16)),
        (D256, nz!(64)),
        (D1536, nz!(16)),
        (D3072, nz!(16)),
    ] {
        let [p0, p1, p2, p3] =
            core::array::from_fn(|index| random_vec(dim.get() as usize, 30 + index as u64));
        let centroids = random_vec(k.get() * dim.get() as usize, 40);

        group.bench_with_input(
            BenchmarkId::new(format!("d{dim}"), k),
            &(dim, k),
            |bencher, _| {
                // SAFETY: point slices have length `d` (multiple of 8),
                // centroids has length `k * d`, and `k > 0`.
                bencher.iter(|| unsafe {
                    kernel::nearest4(
                        black_box(&p0),
                        black_box(&p1),
                        black_box(&p2),
                        black_box(&p3),
                        black_box(&centroids),
                        black_box(k),
                        black_box(NonZero::from(dim.value())),
                    )
                });
            },
        );
    }

    group.finish();
}

fn bench_cluster(criterion: &mut Criterion) {
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .expect("should be built exactly once");

    let mut group = criterion.benchmark_group("cluster");

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
                pool.install(|| {
                    bencher.iter(|| cluster(black_box(&data), black_box(D256), &config));
                });
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
