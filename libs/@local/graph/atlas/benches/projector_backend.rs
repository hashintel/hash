//! Wall-time benchmarks for the projector's training backend.
//!
//! The training backend decision holds train time as the binding constraint, and the training
//! schedule's refresh risk is one full-corpus forward per ladder step per cadence tick. Both price
//! out through the two motions measured here, at the real default architecture (512-wide stem, four
//! residual blocks, `FiLM` from the width-1 `[eta]` condition), on every backend flavor the build
//! carries - the CPU backend always, Metal behind `bench` + `gpu`:
//!
//! ```text
//! cargo bench -p hash-graph-atlas --features bench,gpu --bench projector_backend
//! ```
//!
//! - `step` times forward plus backward through the autodiff decorator at training minibatch sizes
//!   (the per-step cost an epoch budget multiplies). A device sync fences asynchronous backends
//!   inside the timed region, and batches materialize per iteration, so the measurement prices
//!   host-to-device transfer as it recurs per training step.
//! - `forward` times inference forward at refresh-pass batch sizes. The per-step refresh cost is
//!   (corpus rows / batch) of these.
//! - `threads` times one fixed CPU step across rayon pool sizes. The CPU backend's matrix work runs
//!   on matrixmultiply's own pool (`MATMUL_NUM_THREADS`), so a flat response here is the expected
//!   reading, kept as the guard on that fact.
//!
//! - `live/*` times one real training step at the ratified batch plan over a synthesized corpus,
//!   phase by phase: `draw`, `assemble`, and per backend `input`, `forward`, `objective` (readback
//!   plus hand-rolled fields plus surrogate), and `step` (the whole motion, optimizer included).
//!   The phase split decomposes the backend decision into burn tensor work vs hand-rolled CPU work
//!   vs batch pipeline. Each backend's cold first step prints on its own before its timed phases;
//!   on autotuning backends that number is the warmup story criterion's steady state hides.
//!
//! Set `PROJECTOR_BENCH_ROWS` to scale the largest forward batch (default 65536; the full corpus is
//! ~1M rows, and forward cost is linear in rows past cache scale, so per-row numbers extrapolate).
//! `PROJECTOR_BENCH_LIVE_ROWS` scales the live corpus (default 65536). Wall time depends on the
//! host; compare within one machine, not across.
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

/// One real training step at the ratified plan, phase by phase.
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

        // The cold first step carries one-time backend work (autotune,
        // first allocations) that steady-state sampling hides.
        let cold = Instant::now();
        let _cold_loss: f32 = stepper.step(&batch);
        eprintln!(
            "projector_backend/live/{}: cold first step {:?}",
            device,
            cold.elapsed()
        );

        // Phase iterations run isolated (`PerIteration`), never in
        // criterion's tight sample loops: an asynchronous backend's
        // allocator pools per-call buffers, and a loop of corpus-shaped
        // calls grows the pool faster than the device reclaims it.
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
