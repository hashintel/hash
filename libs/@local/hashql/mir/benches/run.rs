#![allow(clippy::allow_attributes)]
#![allow(dead_code)]
use core::hint::black_box;

use codspeed_criterion_compat::{BatchSize, Bencher};
use hashql_core::{
    heap::{Heap, ResetAllocator as _, Scratch},
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{body::Body, context::MirContext, intern::Interner};

#[expect(unsafe_code)]
#[inline]
pub(crate) fn run_bencher<T, const N: usize>(
    bencher: &mut Bencher,
    body: impl for<'heap> Fn(&Environment<'heap>, &Interner<'heap>) -> [Body<'heap>; N],
    mut func: impl for<'env, 'heap> FnMut(
        &mut MirContext<'env, 'heap>,
        &mut [Body<'heap>; N],
        &mut Scratch,
    ) -> T,
) {
    // NOTE: `heap` must not be moved or reassigned; `heap_ptr` assumes its address is stable
    // for the entire duration of this function.
    let mut heap = Heap::new();
    let heap_ptr = &raw mut heap;
    // NOTE: `scratch` must not be moved or reassigned; `scratch_ptr` assumes its address is stable
    // for the entire duration of this function.
    let mut scratch = Scratch::new();
    let scratch_ptr = &raw mut scratch;

    // Using `iter_custom` here would be better, but codspeed doesn't support it yet.
    //
    // IMPORTANT: `BatchSize::PerIteration` is critical for soundness. Do NOT change this to
    // `SmallInput`, `LargeInput`, or any other batch size. Doing so will cause undefined
    // behavior (use-after-free of arena allocations).
    bencher.iter_batched_ref(
        || {
            // SAFETY: We create a `&mut Heap` from the raw pointer to call `reset()` and build
            // the environment/interner/body. This is sound because:
            // - `heap` outlives the entire `iter_batched` call (it's a local in the outer scope).
            // - `BatchSize::PerIteration` ensures only one `(env, interner, body)` tuple exists at
            //   a time, and it is dropped before the next `setup()` call.
            // - No other references to `heap` exist during this closure's execution.
            // - This code runs single-threaded.
            let heap = unsafe { &mut *heap_ptr };
            heap.reset();

            // SAFETY: We create a `&mut Scratch` from the raw pointer to call `reset()`. This is
            // sound because:
            // - `scratch` outlives the entire `iter_batched` call (it's a local in the outer
            //   scope).
            // - `BatchSize::PerIteration` ensures this closure completes and its borrows end before
            //   the routine closure runs, so no aliasing occurs.
            // - No other references to `scratch` exist during this closure's execution.
            // - This code runs single-threaded.
            let scratch = unsafe { &mut *scratch_ptr };
            scratch.reset();

            let env = Environment::new(heap);
            let interner = Interner::new(heap);
            let body = body(&env, &interner);

            (env, interner, body)
        },
        |(env, interner, body)| {
            // SAFETY: We create a shared `&Heap` reference. This is sound because:
            // - The `&mut Heap` from setup no longer exists (setup closure has returned)
            // - The `env`, `interner`, and `body` already hold shared borrows of `heap`
            // - Adding another `&Heap` is just shared-shared aliasing, which is allowed
            let heap = unsafe { &*heap_ptr };
            // SAFETY: We create a mutable `&mut Scratch` reference. This is sound because:
            // - The `&mut Scratch` from setup no longer exists (setup closure has returned), it is
            //   only used to reset.
            // - The `env`, `interner`, and `body` do *not* reference `scratch`.
            // - Therefore due to the sequential nature of the code, `scratch` is the sole reference
            //   to the variable and not aliased.
            // - Scratch space data does *not* escape the closure, the return type `T` of `func` is
            //   irrespective of the scratch space and even if, is immediately dropped after
            //   execution through criterion, only after which the scratch space is reset.
            //   Therefore, no additional references exist.
            let scratch = unsafe { &mut *scratch_ptr };

            let mut context = MirContext {
                heap,
                env,
                interner,
                diagnostics: DiagnosticIssues::new(),
            };

            let value = func(black_box(&mut context), black_box(body), black_box(scratch));
            (context.diagnostics, value)
        },
        BatchSize::PerIteration,
    );
}
