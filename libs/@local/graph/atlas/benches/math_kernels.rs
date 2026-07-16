//! Wall-time and hardware-counter benchmarks for the math kernels.
//!
//! Every benchmark pairs a SIMD kernel with the scalar formulation it
//! replaces, so the vectorization claims in the module docs stay tied to
//! measured numbers rather than emitted-assembly inspection alone.
#![feature(portable_simd)]
#![expect(
    clippy::float_arithmetic,
    clippy::integer_division_remainder_used,
    clippy::significant_drop_tightening,
    reason = "benchmark fixtures compute deterministic floating-point inputs, and Criterion owns \
              group drops; the crate-level expectations in lib.rs do not extend to bench targets"
)]

use core::{hint::black_box, time::Duration};

use codspeed_criterion_compat::{
    Criterion, Throughput, criterion_group, criterion_main, measurement::Measurement,
};
use hash_graph_atlas::math::{
    AffinityCurve, Bounds2, DVecN, Similarity, Transform, Vec2, Vec2x4T, VecN,
};

const EMBEDDING_DIMENSIONS: usize = 512;

/// Deterministic, sign-varying components.
fn scattered<const N: usize>(offset: f32) -> [f32; N] {
    core::array::from_fn(|index| {
        let value = f32::from(u8::try_from(index % 200).expect("bounded by modulus"));

        (value - 100.0).mul_add(0.125, offset)
    })
}

/// Deterministic 2D points spread over a non-degenerate box.
fn scattered_points(count: usize) -> Vec<Vec2> {
    (0..count)
        .map(|index| {
            let value = f32::from(u16::try_from(index % 40_000).expect("bounded by modulus"));

            Vec2::new((value - 17_000.0) * 0.25, (19_000.0 - value) * 0.5)
        })
        .collect()
}

fn bench_vecn<M: Measurement>(criterion: &mut Criterion<M>) {
    let left = VecN::new(scattered::<EMBEDDING_DIMENSIONS>(0.5));
    let right = VecN::new(scattered::<EMBEDDING_DIMENSIONS>(-1.25));

    let mut group = criterion.benchmark_group("vecn");
    group.throughput(Throughput::Elements(EMBEDDING_DIMENSIONS as u64));

    group.bench_function("dot_512", |bencher| {
        bencher.iter(|| black_box(&left).dot(black_box(&right)));
    });
    group.bench_function("dot_512_scalar_reference", |bencher| {
        bencher.iter(|| {
            black_box(&left)
                .as_array()
                .iter()
                .zip(black_box(&right).as_array())
                .map(|(&l_value, &r_value)| f64::from(l_value) * f64::from(r_value))
                .sum::<f64>()
        });
    });
    group.bench_function("cosine_distance_512", |bencher| {
        bencher.iter(|| black_box(&left).cosine_distance(black_box(&right)));
    });

    group.finish();
}

fn bench_affinity<M: Measurement + 'static>(criterion: &mut Criterion<M>) {
    let curve = AffinityCurve::new(1.577, 0.895).expect("parameters are positive and finite");
    let from = Vec2x4T::from([
        Vec2::new(1.0, 5.0),
        Vec2::new(2.0, 6.0),
        Vec2::new(3.0, 7.0),
        Vec2::new(4.0, 8.0),
    ]);
    let to = Vec2x4T::from([
        Vec2::new(0.5, -1.0),
        Vec2::new(2.5, 3.0),
        Vec2::new(-4.0, 0.25),
        Vec2::new(8.0, -2.0),
    ]);

    let mut group = criterion.benchmark_group("affinity");
    group.throughput(Throughput::Elements(4));

    group.bench_function("attraction_x4", |bencher| {
        bencher.iter(|| black_box(curve).attraction_x4(black_box(from), black_box(to)));
    });
    group.bench_function("attraction_x4_scalar_reference", |bencher| {
        bencher.iter(|| {
            core::array::from_fn::<_, 4, _>(|index| {
                black_box(curve).attraction(black_box(from).get(index), black_box(to).get(index))
            })
        });
    });
    group.bench_function("repulsion_x4", |bencher| {
        bencher.iter(|| black_box(curve).repulsion_x4(black_box(from), black_box(to), 1.0));
    });

    group.finish();

    criterion.bench_function("affinity/fit_reference_point", |bencher| {
        bencher.iter(|| AffinityCurve::fit(black_box(1.0), black_box(0.1)));
    });
}

/// Shootout between candidate `pow` lowerings for the gradient kernels.
///
/// The affinity gradients need `d^(2b)` for four lanes with a shared
/// exponent; gradients tolerate a few ulps. Candidates: sleef's 1.0-ulp
/// vector pow, four scalar libm calls (fast on Apple's libm), and the
/// `exp2(p * log2(d))` composition from sleef's cheaper 3.5-ulp variants.
fn bench_pow_strategies<M: Measurement>(criterion: &mut Criterion<M>) {
    use core::simd::{Simd, f32x4};

    let base = f32x4::from_array([0.25, 2.5, 117.0, 0.9]);
    let exponent = 0.895_f32;

    let mut group = criterion.benchmark_group("pow_strategy");
    group.throughput(Throughput::Elements(4));

    group.bench_function("sleef_pow_u10", |bencher| {
        bencher.iter(|| sleef::f32x::pow_u10(black_box(base), Simd::splat(black_box(exponent))));
    });
    group.bench_function("scalar_libm_powf", |bencher| {
        bencher.iter(|| {
            let lanes = black_box(base).to_array();
            let power = black_box(exponent);

            f32x4::from_array([
                lanes[0].powf(power),
                lanes[1].powf(power),
                lanes[2].powf(power),
                lanes[3].powf(power),
            ])
        });
    });
    group.bench_function("sleef_exp2_log2_u35", |bencher| {
        bencher.iter(|| {
            sleef::f32x::exp2_u35(
                Simd::splat(black_box(exponent)) * sleef::f32x::log2_u35(black_box(base)),
            )
        });
    });

    group.finish();
}

fn bench_transforms<M: Measurement>(criterion: &mut Criterion<M>) {
    let transform = Transform::from_scale(Vec2::new(2.0, 3.0))
        .then(Transform::from_translation(Vec2::new(0.5, -1.0)));
    let batch = Vec2x4T::from([
        Vec2::new(1.0, 5.0),
        Vec2::new(2.0, 6.0),
        Vec2::new(3.0, 7.0),
        Vec2::new(4.0, 8.0),
    ]);

    let mut group = criterion.benchmark_group("transform");
    group.throughput(Throughput::Elements(4));

    group.bench_function("apply_x4", |bencher| {
        bencher.iter(|| black_box(transform).apply_x4(black_box(batch)));
    });
    group.bench_function("apply_x4_scalar_reference", |bencher| {
        bencher.iter(|| {
            core::array::from_fn::<_, 4, _>(|index| {
                black_box(transform).apply(black_box(batch).get(index))
            })
        });
    });

    group.finish();
}

fn bench_bounds<M: Measurement>(criterion: &mut Criterion<M>) {
    let small = scattered_points(100_000);
    let large = scattered_points(1_000_000);

    let mut group = criterion.benchmark_group("bounds");

    group.throughput(Throughput::Elements(small.len() as u64));
    group.bench_function("from_slice_100k", |bencher| {
        bencher.iter(|| Bounds2::from_slice(black_box(&small)));
    });
    group.bench_function("from_points_100k_scalar_reference", |bencher| {
        bencher.iter(|| Bounds2::from_points(black_box(&small).iter().copied()));
    });

    group.throughput(Throughput::Elements(large.len() as u64));
    group.bench_function("from_slice_1m", |bencher| {
        bencher.iter(|| Bounds2::from_slice(black_box(&large)));
    });
    group.bench_function("from_slice_par_1m", |bencher| {
        bencher.iter(|| Bounds2::from_slice_par(black_box(&large)));
    });

    group.finish();
}

fn bench_similarity_fit<M: Measurement>(criterion: &mut Criterion<M>) {
    let source = scattered_points(100_000);
    let reference =
        Similarity::from_array([2.0, 0.8, 0.6, 10.0, -4.0]).expect("scale is normal and positive");
    let target: Vec<Vec2> = source.iter().map(|&point| reference.apply(point)).collect();
    let weights = vec![1.0_f32; source.len()];

    let mut group = criterion.benchmark_group("similarity");
    group.throughput(Throughput::Elements(source.len() as u64));

    group.bench_function("fit_100k", |bencher| {
        bencher
            .iter(|| Similarity::fit(black_box(&source), black_box(&target), black_box(&weights)));
    });
    group.bench_function("fit_par_100k", |bencher| {
        bencher.iter(|| {
            Similarity::fit_par(black_box(&source), black_box(&target), black_box(&weights))
        });
    });

    group.finish();
}

fn bench_dvecn<M: Measurement + 'static>(criterion: &mut Criterion<M>) {
    let logits = DVecN::new(core::array::from_fn::<f64, 64, _>(|index| {
        f64::from(u8::try_from(index).expect("bounded dimension")).mul_add(0.05, -1.6)
    }));

    criterion.bench_function("dvecn/softmax_64", |bencher| {
        bencher.iter(|| black_box(logits).softmax());
    });
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
    name = benches;
    config = hardware_counter();
    targets = bench_vecn,
    bench_affinity,
    bench_pow_strategies,
    bench_transforms,
    bench_bounds,
    bench_similarity_fit,
    bench_dvecn
);
criterion_main!(benches);
