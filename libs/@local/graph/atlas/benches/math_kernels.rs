//! Math-kernel comparisons using wall time or calling-thread counters.
//!
//! The suite compares selected vector kernels with scalar references, serial reductions with
//! parallel forms, and production transcendental wrappers with experimental table kernels. Fixtures
//! and surrounding benchmark code determine what each measurement includes.
//!
//! `MATH_BENCH_EVENT` is a comma-separated list. It defaults to `instructions`, including when the
//! list is empty. Each event runs the suite once in list order. Event suffixes such as
//! `kernel@cycles/exp_f32x8` distinguish measurement names in the benchmark IDs.
//!
//! # Measurements
//!
//! On supported Apple Silicon macOS systems, counter names select these events:
//!
//! - `instructions`: retired instructions.
//! - `cycles`: CPU cycles.
//! - `branch-mispredictions`: retired branch mispredictions.
//! - `l1d-cache-misses`: retired L1 data-cache miss loads.
//! - `backend-stalls`: no operation issued due to the backend, available on M4 and M5.
//! - `simd-instructions`: retired non-load/store vector Advanced SIMD instructions, available on M2
//!   through M5.
//!
//! The program uses its existing privileges for counter access, which requires root privileges or
//! the kernel's kpc entitlement. `wall-time` uses Criterion's wall-clock measurement without
//! counter access. On non-macOS platforms the counter backend also measures wall time, even when an
//! ID carries a counter-event suffix.
//!
//! Instruction counts do not measure instruction-level parallelism and can vary with executed paths
//! and allocator state. Compare cycles as well as instructions on the same machine and workload.
//! Backend stalls aggregate backend causes rather than isolate one dependency chain. The
//! vector-instruction event omits loads and stores and is not a count of all SIMD work.
//!
//! Hardware counts cover the calling thread, including any work it executes inside a parallel
//! operation. Counts from other Rayon workers are omitted. Use `wall-time` to compare the
//! completion times of serial and parallel reductions.
//!
//! # Running the suite
//!
//! These shell commands select counters or wall time:
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
use hash_graph_atlas::bench::{kernel, math};

/// The embedding width the vector kernels run at.
const EMBEDDING_DIMENSIONS: usize = 512;

/// Generates a repeating sequence of sign-varying components plus `offset`.
fn scattered<const N: usize>(offset: f32) -> [f32; N] {
    core::array::from_fn(|index| {
        let value = f32::from(u8::try_from(index % 200).expect("bounded by modulus"));

        (value - 100.0).mul_add(0.125, offset)
    })
}

/// Measures dot product and cosine distance at the embedding width.
fn bench_vecn<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let pair = math::vecn_pair(
        scattered::<EMBEDDING_DIMENSIONS>(0.5),
        scattered::<EMBEDDING_DIMENSIONS>(-1.25),
    );

    let mut group = criterion.benchmark_group(format!("vecn@{event}"));
    group.throughput(Throughput::Elements(EMBEDDING_DIMENSIONS as u64));

    group.bench_function("dot_512", |bencher| {
        bencher.iter(|| math::vecn_dot(&pair));
    });
    group.bench_function("dot_512_scalar_reference", |bencher| {
        bencher.iter(|| math::vecn_dot_scalar_reference(&pair));
    });
    group.bench_function("cosine_distance_512", |bencher| {
        bencher.iter(|| math::vecn_cosine_distance(&pair));
    });

    group.finish();
}

/// Measures batched affinity gradients and the reference-point fit.
fn bench_affinity<M: Measurement + 'static>(criterion: &mut Criterion<M>, event: &str) {
    let state = math::affinity_state(
        1.577,
        0.895,
        [[1.0, 5.0], [2.0, 6.0], [3.0, 7.0], [4.0, 8.0]],
        [[0.5, -1.0], [2.5, 3.0], [-4.0, 0.25], [8.0, -2.0]],
    );

    let mut group = criterion.benchmark_group(format!("affinity@{event}"));
    group.throughput(Throughput::Elements(4));

    group.bench_function("attraction_x4", |bencher| {
        bencher.iter(|| math::affinity_attraction_x4(&state));
    });
    group.bench_function("attraction_x4_scalar_reference", |bencher| {
        bencher.iter(|| math::affinity_attraction_scalar_reference(&state));
    });
    group.bench_function("repulsion_x4", |bencher| {
        bencher.iter(|| math::affinity_repulsion_x4(&state, 1.0));
    });

    group.finish();

    criterion.bench_function(
        &format!("affinity@{event}/fit_reference_point"),
        |bencher| {
            bencher.iter(|| math::affinity_fit(1.0, 0.1));
        },
    );
}

/// Measures scalar powers alone and inside a synthetic rational coefficient.
///
/// The scalar comparison applies [`f32::powf`] to four lanes with exponent 0.895. The coefficient
/// fixture evaluates −2abP/(1 + aPρ), with ρ the squared distance, a = 1.577, b = 0.895 and P = ρᵇ.
/// The attractive gradient uses this form with P = ρᵇ⁻¹. This fixture's exponent makes it a
/// separate synthetic workload. The `kernel@{event}/pow_f32x4` entry measures the vector power
/// composition in isolation.
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
    // embed the power in surrounding vector arithmetic to measure the combined workload. The
    // benchmark name uses "fused" for this combination, not for a fused multiply-add.
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

/// Measures transcendental wrappers and table-exponential candidates.
///
/// The gather and architecture-specific table entries are alternatives to the production
/// exponential. Each benchmark measures the fixture's complete wrapper call.
fn bench_kernels<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    use core::simd::{Simd, f32x4, f32x8, f64x4};

    // sample the normal-output range near its extremes and around zero. Saturating overflow, deep
    // underflow and non-finite inputs need separate fixtures.
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

/// Measures four-lane transform application beside its scalar reference.
fn bench_transforms<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let state = math::transform_batch(
        [2.0, 3.0],
        [0.5, -1.0],
        [[1.0, 5.0], [2.0, 6.0], [3.0, 7.0], [4.0, 8.0]],
    );

    let mut group = criterion.benchmark_group(format!("transform@{event}"));
    group.throughput(Throughput::Elements(4));

    group.bench_function("apply_x4", |bencher| {
        bencher.iter(|| math::transform_apply_x4(&state));
    });
    group.bench_function("apply_x4_scalar_reference", |bencher| {
        bencher.iter(|| math::transform_apply_scalar_reference(&state));
    });

    group.finish();
}

/// Measures bounds reduction over 100,000 and 1,000,000 collinear points.
///
/// The fixture repeats points on y = 1000 − 2x. The slice kernel runs beside its scalar reference
/// at 100,000 rows and beside its parallel form at 1,000,000.
fn bench_bounds<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let small = math::scattered_points(100_000);
    let large = math::scattered_points(1_000_000);

    let mut group = criterion.benchmark_group(format!("bounds@{event}"));

    group.throughput(Throughput::Elements(small.len() as u64));
    group.bench_function("from_slice_100k", |bencher| {
        bencher.iter(|| math::bounds_from_slice(&small));
    });
    group.bench_function("from_points_100k_scalar_reference", |bencher| {
        bencher.iter(|| math::bounds_from_points_scalar_reference(&small));
    });

    group.throughput(Throughput::Elements(large.len() as u64));
    group.bench_function("from_slice_1m", |bencher| {
        bencher.iter(|| math::bounds_from_slice(&large));
    });
    group.bench_function("from_slice_par_1m", |bencher| {
        bencher.iter(|| math::bounds_from_slice_par(&large));
    });

    group.finish();
}

/// Measures serial and parallel similarity fits over 100,000 rows.
fn bench_similarity_fit<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let fixture = math::similarity_fixture(100_000, [2.0, 0.8, 0.6, 10.0, -4.0]);

    let mut group = criterion.benchmark_group(format!("similarity@{event}"));
    group.throughput(Throughput::Elements(fixture.len() as u64));

    group.bench_function("fit_100k", |bencher| {
        bencher.iter(|| math::similarity_fit(&fixture));
    });
    group.bench_function("fit_par_100k", |bencher| {
        bencher.iter(|| math::similarity_fit_par(&fixture));
    });

    group.finish();
}

/// Measures a 64-way double-precision softmax.
fn bench_dvecn<M: Measurement + 'static>(criterion: &mut Criterion<M>, event: &str) {
    let logits = math::logits(core::array::from_fn::<f64, 64, _>(|index| {
        f64::from(u8::try_from(index).expect("bounded dimension")).mul_add(0.05, -1.6)
    }));

    criterion.bench_function(&format!("dvecn@{event}/softmax_64"), |bencher| {
        bencher.iter(|| math::dvecn_softmax(&logits));
    });
}

/// Configures Criterion with the backend for a counter-event name.
///
/// By default, requests a half-second warm-up and one second of measurement over 20 samples. The
/// non-macOS backend uses wall time.
///
/// # Panics
///
/// Panics if `event` is unknown. On macOS, also panics if sampler initialization, event
/// configuration or counter start fails, or if a previous acquisition set the process-local guard.
/// This includes unsupported events and unavailable counter privileges.
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

/// Compares serial, per-point parallel and chunked parallel finiteness scans.
///
/// The finite fixtures range from 2¹² to 2²⁰ rows, exercising complete scans rather than early
/// rejection. `wall-time` measures completion of the parallel work. Hardware counters cover only
/// the calling thread's share.
fn bench_finite_scan<M: Measurement>(criterion: &mut Criterion<M>, event: &str) {
    let mut group = criterion.benchmark_group(format!("finite_scan@{event}"));
    for exponent in [12_u32, 14, 16, 18, 20] {
        let rows = 1_usize << exponent;
        let field = math::finite_field(rows);
        group.throughput(Throughput::Elements(rows as u64));
        group.bench_function(format!("serial/{rows}"), |bencher| {
            bencher.iter(|| math::finite_scan_serial(black_box(&field)));
        });
        group.bench_function(format!("per_point/{rows}"), |bencher| {
            bencher.iter(|| math::finite_scan_per_point(black_box(&field)));
        });
        group.bench_function(format!("chunked/{rows}"), |bencher| {
            bencher.iter(|| math::finite_scan_chunked(black_box(&field)));
        });
    }
    group.finish();
}

/// Runs all groups with an event-qualified benchmark ID.
///
/// # Panics
///
/// Propagates benchmark and measurement panics, including failures to sample a hardware counter.
fn run_benches<M: Measurement + 'static>(criterion: &mut Criterion<M>, event: &str) {
    bench_vecn(criterion, event);
    bench_affinity(criterion, event);
    bench_pow_strategies(criterion, event);
    bench_kernels(criterion, event);
    bench_transforms(criterion, event);
    bench_bounds(criterion, event);
    bench_similarity_fit(criterion, event);
    bench_dvecn(criterion, event);
    bench_finite_scan(criterion, event);
}

/// Runs the suite once under a single measurement.
///
/// # Panics
///
/// Propagates [`hardware_counter`] and benchmark panics. Criterion argument processing also
/// applies.
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

/// Runs the suite once per event, defaulting to retired instructions.
///
/// `MATH_BENCH_EVENT` supplies a comma-separated list. A multi-event list re-executes this binary
/// once per event, with each child inheriting the arguments. An empty list selects `instructions`.
///
/// # Panics
///
/// Propagates [`run_event`] panics for a single event. For multiple events, panics if the
/// executable path is unavailable, a child cannot be spawned, or any child exits unsuccessfully.
fn main() {
    // The macOS counter backend leaves its acquisition guard set after a successful acquisition,
    // including after Drop. Re-executing creates a process-local guard for each event. Therefore
    // each child can acquire its own measurement once.
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
