#![expect(clippy::significant_drop_tightening)]

use core::hint::black_box;
use std::time::Duration;

use codspeed_criterion_compat::{BatchSize, Criterion, criterion_group, criterion_main};
use darwin_kperf_criterion::HardwareCounter;
use hashql_core::{
    heap::{Heap, ResetAllocator as _},
    module::ModuleRegistry,
    r#type::environment::Environment,
};

fn stdlib_construction(criterion: &mut Criterion<HardwareCounter>) {
    let mut group = criterion.benchmark_group("stdlib");

    group.bench_function("construction", |bencher| {
        let mut heap = Heap::new();
        let heap_ptr = &raw mut heap;

        // IMPORTANT: `BatchSize::PerIteration` is critical for soundness. Do NOT change this to
        // `SmallInput`, `LargeInput`, or any other batch size. Doing so will cause undefined
        // behavior (use-after-free of arena allocations).
        bencher.iter_batched(
            || {
                // SAFETY: We create a `&mut Heap` from the raw pointer to call `reset()` and
                // build the environment. This is sound because:
                // - `heap` outlives the entire `iter_batched` call (it's a local in the outer
                //   scope).
                // - `BatchSize::PerIteration` ensures only one environment exists at a time,
                //   dropped before the next setup call.
                // - No other references to `heap` exist during this closure's execution.
                // - This code runs single-threaded.
                #[expect(unsafe_code)]
                let heap = unsafe { &mut *heap_ptr };
                heap.reset();

                Environment::new(heap)
            },
            |environment| {
                black_box(ModuleRegistry::new(&environment));
            },
            BatchSize::PerIteration,
        );
    });

    group.finish();
}

fn measurement() -> Criterion<HardwareCounter> {
    Criterion::default()
        .with_measurement(
            HardwareCounter::instructions().expect("failed to initialize hardware counters"),
        )
        .warm_up_time(Duration::from_millis(500))
        .measurement_time(Duration::from_secs(3))
        .sample_size(50)
}

criterion_group! {
    name = benches;
    config = measurement();
    targets = stdlib_construction
}
criterion_main!(benches);
