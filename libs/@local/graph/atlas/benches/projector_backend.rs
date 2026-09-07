//! Wall-time benchmarks for the projector's training backend.
//!
//! Training is bound by wall time, and so is the choice of its backend. This benchmark compares
//! that time across the available backends without running full training runs. CI does not run it.
//! It is a reference for backend decisions and for changes down the line.
//!
//! The projector under test is the default `Architecture` (a 512-wide stem, four residual blocks,
//! and `FiLM` conditioning from the width-1 `[eta]` input). The workload therefore matches
//! training. Run the benchmark with:
//!
//! ```text
//! cargo bench -p hash-graph-atlas --features bench --bench projector_backend
//! ```
//!
//! Each group isolates one cost:
//!
//! - `step` times forward plus backward through the autodiff decorator at training minibatch sizes.
//!   An epoch budget multiplies this per-step cost. Every call uploads the host batch to the
//!   device. The measurement therefore includes host-to-device transfer as training incurs it. A
//!   device sync inside the timed region makes asynchronous backends comparable.
//! - `forward` times inference forward at refresh-pass batch sizes. The per-step refresh cost is
//!   (corpus rows / batch) of these.
//! - `threads` times one fixed CPU step across rayon pool sizes. The CPU backend's matrix work runs
//!   on matrixmultiply's own pool (`MATMUL_NUM_THREADS`), not rayon's. The expected result is a
//!   flat response, and this group guards that fact.
//! - `live/*` times one real training step at the production batch plan over a synthesized corpus,
//!   phase by phase: `draw` and `assemble` are shared, `input`, `refresh` and `step` run on every
//!   backend, and `forward` and `objective` run on the CPU only (the comment in `bench_live_step`
//!   says why). Each backend's cold first step prints on its own before the timed phases.
//!
//! The environment scales the workload:
//!
//! - `PROJECTOR_BENCH_ROWS` scales the largest forward batch (default 65536). A deployed corpus is
//!   around 1M rows, and forward cost is linear in rows past cache scale, therefore per-row numbers
//!   extrapolate.
//! - `PROJECTOR_BENCH_LIVE_ROWS` scales the live corpus (default 65536).
//!
//! Wall time depends on the host. Compare within one machine, not across.
#![expect(
    clippy::decimal_literal_representation,
    clippy::significant_drop_tightening,
    clippy::print_stderr,
    clippy::use_debug,
    reason = "batch sizes are row counts, Criterion owns group drops, and the cold-step report \
              prints wall time to stderr"
)]

use core::{hint::black_box, time::Duration};
use std::time::Instant;

use codspeed_criterion_compat::{
    BatchSize, Criterion, Throughput, criterion_group, criterion_main,
};
use hash_graph_atlas::{
    bench::projector::{Batch, Model, live},
    device::{Device, PinnedDevice},
};
use rand_xoshiro::Xoshiro256PlusPlus;
use rayon::ThreadPoolBuilder;

const SEED: u64 = 0x9C0E_C708;

const DEVICES: &[PinnedDevice] = &[Device::Cpu.pin(0), Device::host().pin(0)];

fn rows() -> usize {
    std::env::var("PROJECTOR_BENCH_ROWS").map_or(65_536, |value| {
        value
            .parse()
            .expect("PROJECTOR_BENCH_ROWS should be a row count")
    })
}

fn synthesize(rows: usize) -> Batch {
    Batch::new::<Xoshiro256PlusPlus>(rows, SEED)
}

/// Forward plus backward at training minibatch sizes.
fn bench_training_step(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("projector_backend/step");
    group.sample_size(10);

    for &device in DEVICES {
        let model = Model::build::<Xoshiro256PlusPlus>(device, SEED);
        for rows in [256, 1_024, 4_096, 16_384] {
            let batch = synthesize(rows);
            group.throughput(Throughput::Elements(rows as u64));
            group.bench_function(format!("{device}/{rows}"), |bencher| {
                bencher.iter(|| black_box(model.forward_backward(black_box(&batch))));
            });
        }
    }

    group.finish();
}

/// Inference forward at refresh-pass batch sizes.
fn bench_forward(criterion: &mut Criterion) {
    let largest = rows();

    let mut group = criterion.benchmark_group("projector_backend/forward");
    group.sample_size(10);

    for &device in DEVICES {
        let model = Model::build::<Xoshiro256PlusPlus>(device, SEED);
        for rows in [1_024, 16_384, largest] {
            let batch = synthesize(rows);
            group.throughput(Throughput::Elements(rows as u64));
            group.bench_function(format!("{device}/{rows}"), |bencher| {
                bencher.iter(|| black_box(model.forward(black_box(&batch))));
            });
        }
    }

    group.finish();
}

/// One fixed CPU training step across rayon pool sizes.
fn bench_thread_scaling(criterion: &mut Criterion) {
    let model = Model::build::<Xoshiro256PlusPlus>(Device::Cpu.pin(0), SEED);
    let batch = synthesize(4_096);

    let mut group = criterion.benchmark_group("projector_backend/threads");
    group.sample_size(10);
    group.throughput(Throughput::Elements(batch.rows() as u64));

    let available = rayon::current_num_threads();
    for threads in [1, 2, 4, 8, 16] {
        if threads > available {
            break;
        }
        let pool = ThreadPoolBuilder::new()
            .num_threads(threads)
            .build()
            .expect("the bench pool should build");
        group.bench_function(format!("{threads}"), |bencher| {
            bencher.iter(|| pool.install(|| black_box(model.forward_backward(black_box(&batch)))));
        });
    }

    group.finish();
}

/// One real training step at the production plan, phase by phase.
fn bench_live_step(criterion: &mut Criterion) {
    let rows = std::env::var("PROJECTOR_BENCH_LIVE_ROWS").map_or(65_536, |value| {
        value
            .parse()
            .expect("PROJECTOR_BENCH_LIVE_ROWS should be a row count")
    });
    let fixture = live::Fixture::build(rows, SEED);
    let sampler = fixture.sampler();
    let batch = fixture.assemble(sampler.draw(SEED));

    let mut group = criterion.benchmark_group("projector_backend/live");
    group.sample_size(10);
    group.throughput(Throughput::Elements(batch.rows() as u64));

    group.bench_function("draw", |bencher| {
        bencher.iter(|| black_box(sampler.draw(black_box(SEED))));
    });
    group.bench_function("assemble", |bencher| {
        bencher.iter_batched(
            || sampler.draw(SEED),
            |drawn| black_box(fixture.assemble(drawn)),
            BatchSize::LargeInput,
        );
    });

    for &device in DEVICES {
        let mut stepper = live::Stepper::build(&fixture, device, SEED);

        // The first step carries one-time backend work (autotune, first allocations) that `burn`
        // offers no way to run separately. It runs once here and its time prints on its own,
        // because criterion's steady-state sampling would hide it.
        let cold = Instant::now();
        let _cold_loss: f32 = stepper.step(&batch);
        eprintln!(
            "projector_backend/live/{}: cold first step {:?}",
            device,
            cold.elapsed()
        );

        // Per-iteration batching. The buffers are large, and an asynchronous backend frees them
        // after the call returns. In criterion's tight sample loop the allocator's pool
        // would grow faster than the device reclaims it.
        group.bench_function(format!("{device}/input"), |bencher| {
            bencher.iter_batched(
                || (),
                |()| stepper.input(black_box(&batch)),
                BatchSize::PerIteration,
            );
        });
        group.bench_function(format!("{device}/refresh"), |bencher| {
            bencher.iter_batched(
                || (),
                |()| black_box(stepper.refresh(black_box(&batch))),
                BatchSize::PerIteration,
            );
        });

        // The backward pass releases the autodiff graph. `forward` and `objective` build one and
        // never run backward. On the GPU each iteration then holds its graph's buffers until the
        // allocator gets to them, and a sample loop runs out of memory. The CPU backend frees
        // synchronously and therefore runs these two phases alone.
        if device == Device::Cpu.pin(0) {
            group.bench_function(format!("{device}/forward"), |bencher| {
                bencher.iter_batched(
                    || (),
                    |()| black_box(stepper.forward(black_box(&batch))),
                    BatchSize::PerIteration,
                );
            });
            group.bench_function(format!("{device}/objective"), |bencher| {
                bencher.iter_batched(
                    || (),
                    |()| black_box(stepper.objective(black_box(&batch))),
                    BatchSize::PerIteration,
                );
            });
        }

        group.bench_function(format!("{device}/step"), |bencher| {
            bencher.iter_batched(
                || (),
                |()| black_box(stepper.step(black_box(&batch))),
                BatchSize::PerIteration,
            );
        });
    }

    group.finish();
}

fn config() -> Criterion {
    Criterion::default()
        .warm_up_time(Duration::from_millis(500))
        .measurement_time(Duration::from_secs(10))
}

criterion_group!(
    name = benches;
    config = config();
    targets = bench_live_step, bench_training_step, bench_forward, bench_thread_scaling
);
criterion_main!(benches);
