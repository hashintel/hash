//! Wall-time and hardware-counter benchmarks for the math kernels.
//!
//! Every benchmark pairs a SIMD kernel with the scalar formulation it replaces, so the
//! vectorization claims in the module docs stay tied to measured numbers rather than
//! emitted-assembly inspection alone.
//!
//! The measurement defaults to retired instructions, and `MATH_BENCH_EVENT`, a comma-separated
//! list, selects it: every listed measurement runs the whole suite once, in list order, with
//! the event suffixed into the benchmark ids (`kernel@cycles/exp_f32x8`), so each event keeps its
//! own statistics lineage and run-over-run change reports compare like with like. The
//! events: `instructions`, `cycles`, `branch-mispredictions`, `l1d-cache-misses`,
//! `backend-stalls` (cycles the scheduler issued nothing because execution was waiting, the
//! direct view of dependency-chain latency), and `simd-instructions` (retired vector ALU
//! operations, loop scaffolding filtered out); `wall-time` selects criterion's default wall-clock
//! measurement instead, which needs no elevated privileges. A list containing any other event
//! runs under sudo. Instruction counts are stable across runs but blind to instruction-level
//! parallelism; confirm a winner in `cycles` before acting on close calls, and weigh instruction
//! counts higher for kernels that run fused inside larger loops, where issue slots are the shared
//! resource.
//!
//! Counters attribute to the calling thread only: rayon-parallel benchmarks under-report every
//! event because the workers' counts are invisible. Read parallel entries as coordination overhead,
//! not as the work itself.
//!
//! ```text
//! sudo MATH_BENCH_EVENT=cycles,backend-stalls cargo bench -p hash-graph-atlas --features bench --bench math_kernels
//! MATH_BENCH_EVENT=wall-time cargo bench -p hash-graph-atlas --features bench --bench math_kernels
//! ```
#![feature(portable_simd)]
#![expect(
    clippy::float_arithmetic,
    clippy::integer_division_remainder_used,
    clippy::significant_drop_tightening,
    reason = "benchmark fixtures compute deterministic floating-point inputs, and Criterion owns \
              group drops; the crate-level expectations in lib.rs do not extend to bench targets"
)]

use core::{hint::black_box, time::Duration};

use codspeed_criterion_compat::{Criterion, Throughput, measurement::Measurement};
use hash_graph_atlas::{
    bench::kernel,
    math::{AffinityCurve, Bounds2, DVecN, Similarity, Transform, Vec2, Vec2x4T, VecN},
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

fn bench_vecn<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let left = VecN::new(scattered::<EMBEDDING_DIMENSIONS>(0.5));
    let right = VecN::new(scattered::<EMBEDDING_DIMENSIONS>(-1.25));

    let mut group = criterion.benchmark_group(format!("vecn@{event}"));
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

fn bench_affinity<M: Measurement + 'static>(criterion: &mut Criterion<M>, event: &str) {
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

    let mut group = criterion.benchmark_group(format!("affinity@{event}"));
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

    criterion.bench_function(
        &format!("affinity@{event}/fit_reference_point"),
        |bencher| {
            bencher.iter(|| AffinityCurve::fit(black_box(1.0), black_box(0.1)));
        },
    );
}

/// Scalar-libm baselines for the gradient kernels' `pow` composition.
///
/// The affinity gradients need `d^(2b)` for four lanes with a shared exponent; gradients tolerate a
/// few ulps. The production choice is the vendored `exp2(p * log2(d))` composition (measured as
/// `kernel/pow_f32x4`); these entries keep its scalar-libm alternative measured in the same
/// isolated and fused-in-coefficient forms.
fn bench_pow_strategies<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    use core::simd::{Simd, f32x4};

    let base = f32x4::from_array([0.25, 2.5, 117.0, 0.9]);
    let exponent = 0.895_f32;

    let mut group = criterion.benchmark_group(format!("pow_strategy@{event}"));
    group.throughput(Throughput::Elements(4));

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
    // The fused variant embeds the strategy in the attraction-coefficient
    // arithmetic, measuring what the isolated calls cannot: whether the
    // instruction-count gap converts to cycles once the pow competes with
    // surrounding vector work for issue slots.
    let curve_a = 1.577_f32;
    let curve_b = 0.895_f32;
    let coefficient = |power: f32x4, distance_squared: f32x4| {
        (Simd::splat(-2.0 * curve_a * curve_b) * power)
            / (Simd::splat(curve_a) * power * distance_squared + Simd::splat(1.0))
    };

    group.bench_function("fused_scalar_libm_powf", |bencher| {
        bencher.iter(|| {
            let distance_squared = black_box(base);
            let lanes = distance_squared.to_array();
            let exponent = black_box(exponent);
            let power = f32x4::from_array([
                lanes[0].powf(exponent),
                lanes[1].powf(exponent),
                lanes[2].powf(exponent),
                lanes[3].powf(exponent),
            ]);

            coefficient(power, distance_squared)
        });
    });

    group.finish();
}

/// The production wrappers over the vendored SLEEF kernels.
///
/// Each entry measures a wrapper exactly as production calls it; the saved per-event baselines make
/// a rewrite of the vendored kernels visible as an instruction-count or cycle change run over run.
fn bench_kernels<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    use core::simd::{Simd, f32x4, f32x8, f64x4};

    // Lane values spread across the interesting ranges: large-negative
    // (underflow edge), moderate, near-zero, and large-positive
    // (overflow edge) keep every polynomial and scaling path live.
    let f32_inputs = f32x8::from_array([-87.3, -12.5, -1.0, -1e-4, 0.0, 0.5, 42.0, 88.7]);
    let f64_inputs = f64x4::from_array([-708.0, -0.5, 1e-9, 709.0]);
    let base = f32x4::from_array([0.25, 2.5, 117.0, 0.9]);
    let exponent = 0.895_f32;

    let mut group = criterion.benchmark_group(format!("kernel@{event}"));

    group.throughput(Throughput::Elements(8));
    group.bench_function("exp_f32x8", |bencher| {
        bencher.iter(|| kernel::exp_f32x8(black_box(f32_inputs)));
    });
    group.bench_function("exp_f32x8_table_gather", |bencher| {
        bencher.iter(|| kernel::exp_f32x8_table_gather(black_box(f32_inputs)));
    });
    #[cfg(all(target_arch = "aarch64", target_endian = "little"))]
    group.bench_function("exp_f32x8_table_tbl4", |bencher| {
        bencher.iter(|| kernel::exp_f32x8_table_tbl4(black_box(f32_inputs)));
    });

    group.throughput(Throughput::Elements(4));
    group.bench_function("exp_f64x4", |bencher| {
        bencher.iter(|| kernel::exp_f64x4(black_box(f64_inputs)));
    });
    group.bench_function("pow_f32x4", |bencher| {
        bencher.iter(|| kernel::pow_f32x4(black_box(base), Simd::splat(black_box(exponent))));
    });

    group.finish();
}

fn bench_transforms<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let transform = Transform::from_scale(Vec2::new(2.0, 3.0))
        .then(Transform::from_translation(Vec2::new(0.5, -1.0)));
    let batch = Vec2x4T::from([
        Vec2::new(1.0, 5.0),
        Vec2::new(2.0, 6.0),
        Vec2::new(3.0, 7.0),
        Vec2::new(4.0, 8.0),
    ]);

    let mut group = criterion.benchmark_group(format!("transform@{event}"));
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

fn bench_bounds<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let small = scattered_points(100_000);
    let large = scattered_points(1_000_000);

    let mut group = criterion.benchmark_group(format!("bounds@{event}"));

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

fn bench_similarity_fit<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let source = scattered_points(100_000);
    let reference =
        Similarity::from_array([2.0, 0.8, 0.6, 10.0, -4.0]).expect("scale is normal and positive");
    let target: Vec<Vec2> = source.iter().map(|&point| reference.apply(point)).collect();
    let weights = vec![1.0_f32; source.len()];

    let mut group = criterion.benchmark_group(format!("similarity@{event}"));
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

fn bench_dvecn<M: Measurement + 'static>(criterion: &mut Criterion<M>, event: &str) {
    let logits = DVecN::new(core::array::from_fn::<f64, 64, _>(|index| {
        f64::from(u8::try_from(index).expect("bounded dimension")).mul_add(0.05, -1.6)
    }));

    criterion.bench_function(&format!("dvecn@{event}/softmax_64"), |bencher| {
        bencher.iter(|| black_box(logits).softmax());
    });
}

fn hardware_counter(event: &str) -> Criterion<darwin_kperf_criterion::HardwareCounter> {
    use darwin_kperf_criterion::HardwareCounter;
    use darwin_kperf_events::Event;

    let counter = match event {
        "instructions" => HardwareCounter::instructions(),
        "cycles" => HardwareCounter::cycles(),
        "branch-mispredictions" => HardwareCounter::branch_mispredictions(),
        "l1d-cache-misses" => HardwareCounter::l1d_cache_misses(),
        "backend-stalls" => HardwareCounter::custom(Event::ArmStallBackend),
        "simd-instructions" => HardwareCounter::custom(Event::InstSimdAluVec),
        other => panic!(
            "unknown MATH_BENCH_EVENT `{other}`; expected a comma-separated list of \
             `instructions`, `cycles`, `branch-mispredictions`, `l1d-cache-misses`, \
             `backend-stalls`, `simd-instructions`, or `wall-time`"
        ),
    };

    Criterion::default()
        .with_measurement(
            counter.expect("hardware counters require root on Apple Silicon (run under sudo)"),
        )
        .warm_up_time(Duration::from_millis(500))
        .measurement_time(Duration::from_secs(1))
        .sample_size(20)
}

/// Runs every group under `criterion`, with `event` suffixed into each benchmark id.
///
/// The suffix keeps every measurement's statistics in its own lineage: benchmark ids are
/// criterion's storage key, so without it a multi-event run would overwrite one event's samples
/// with the next's and compare quantities of different units run over run.
fn run_benches<M: Measurement + 'static>(criterion: &mut Criterion<M>, event: &str) {
    bench_vecn(criterion, event);
    bench_affinity(criterion, event);
    bench_pow_strategies(criterion, event);
    bench_kernels(criterion, event);
    bench_transforms(criterion, event);
    bench_bounds(criterion, event);
    bench_similarity_fit(criterion, event);
    bench_dvecn(criterion, event);
}

/// Runs the suite once under a single measurement.
fn run_event(event: &str) {
    if event == "wall-time" {
        let mut criterion = Criterion::default()
            .warm_up_time(Duration::from_millis(500))
            .measurement_time(Duration::from_secs(1))
            .sample_size(20)
            .configure_from_args();
        run_benches(&mut criterion, event);
    } else {
        let mut criterion = hardware_counter(event).configure_from_args();
        run_benches(&mut criterion, event);
    }

    Criterion::default().configure_from_args().final_summary();
}

// The dispatch mirrors `criterion_group!`/`criterion_main!` expansion;
// the macros cannot express two measurement types behind one binary,
// and a measurement is a property of a whole `Criterion<M>` instance.
// A multi-event selection re-execs this binary once per event instead
// of looping instances in-process: kpc counter configuration is
// per-process state, and a second configurable-event setup in the same
// process fails with `FailedToSetKpcConfig` (the fixed-counter events,
// instructions and cycles, mask the problem by not needing one).
fn main() {
    let events = std::env::var("MATH_BENCH_EVENT").unwrap_or_else(|_| "instructions".to_owned());
    let events: Vec<&str> = events
        .split(',')
        .map(str::trim)
        .filter(|event| !event.is_empty())
        .collect();

    match events.as_slice() {
        [] => run_event("instructions"),
        [event] => run_event(event),
        legs => {
            let executable =
                std::env::current_exe().expect("benchmark executable path is readable");
            let arguments: Vec<_> = std::env::args_os().skip(1).collect();
            let mut failed = Vec::new();
            for event in legs {
                let status = std::process::Command::new(&executable)
                    .args(&arguments)
                    .env("MATH_BENCH_EVENT", event)
                    .status()
                    .expect("spawning the per-event benchmark child");
                if !status.success() {
                    failed.push(*event);
                }
            }
            assert!(failed.is_empty(), "event legs failed: {failed:?}");
        }
    }
}
