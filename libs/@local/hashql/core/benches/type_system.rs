#![expect(clippy::significant_drop_tightening)]

use core::hint::black_box;

use codspeed_criterion_compat::{BatchSize, Bencher, Criterion, criterion_group, criterion_main};
use hashql_core::{
    heap::{Heap, ResetAllocator as _},
    r#type::{
        TypeId,
        builder::{TypeBuilder, lazy},
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance,
        },
        inference::{Constraint, Variable, VariableKind},
    },
};

// =============================================================================
// Type Fixtures
// =============================================================================

fn create_nested_struct(builder: &TypeBuilder<'_, '_>) -> TypeId {
    let simple_struct = builder.r#struct([
        ("name", builder.string()),
        ("age", builder.integer()),
        ("active", builder.boolean()),
    ]);

    builder.r#struct([
        ("user", simple_struct),
        (
            "metadata",
            builder.r#struct([("created", builder.string()), ("updated", builder.string())]),
        ),
    ])
}

fn create_recursive_type(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.r#struct(lazy(|id, builder| {
        [
            ("value", builder.integer()),
            ("left", builder.union([id.value(), builder.null()])),
            ("right", builder.union([id.value(), builder.null()])),
        ]
    }))
}

// =============================================================================
// Benchmark Helpers
// =============================================================================

#[expect(unsafe_code)]
fn bench_with_env<'heap, T, U: 'heap>(
    bencher: &mut Bencher,
    mut setup: impl FnMut(&mut TypeBuilder<'_, 'heap>) -> T,
    mut run: impl FnMut(&mut Environment<'heap>, &mut T) -> U,
) {
    let mut heap = Heap::new();
    let heap_ptr = &raw mut heap;

    // IMPORTANT: `BatchSize::PerIteration` is critical for soundness. Do NOT change this to
    // `SmallInput`, `LargeInput`, or any other batch size. Doing so will cause undefined
    // behavior (use-after-free of arena allocations).
    bencher.iter_batched_ref(
        || {
            // SAFETY: We create a `&mut Heap` from the raw pointer to call `reset()` and build
            // the environment. This is sound because:
            // - `heap` outlives the entire `iter_batched` call (it's a local in the outer scope).
            // - `BatchSize::PerIteration` ensures only one tuple exists at a time, dropped before
            //   the next `setup()` call.
            // - No other references to `heap` exist during this closure's execution.
            // - This code runs single-threaded.
            let heap = unsafe { &mut *heap_ptr };
            heap.reset();

            let env = Environment::new(heap);
            let mut builder = TypeBuilder::synthetic(&env);
            let data = setup(&mut builder);

            (env, data)
        },
        |(env, data)| run(black_box(env), black_box(data)),
        BatchSize::PerIteration,
    );
}

fn bench_lattice<'heap, T, U: 'heap>(
    bencher: &mut Bencher,
    setup: impl FnMut(&mut TypeBuilder<'_, 'heap>) -> T,
    mut run: impl FnMut(&mut LatticeEnvironment<'_, 'heap>, &mut T) -> U,
) {
    bench_with_env(bencher, setup, |env, data| {
        let mut lattice_env = LatticeEnvironment::new(env).without_warnings();
        let result = run(&mut lattice_env, data);

        debug_assert!(lattice_env.diagnostics.is_empty());

        (result, lattice_env.into_skeleton())
    });
}

fn bench_analysis<'heap, T, U: 'heap>(
    bencher: &mut Bencher,
    setup: impl FnMut(&mut TypeBuilder<'_, 'heap>) -> T,
    mut run: impl FnMut(&mut AnalysisEnvironment<'_, 'heap>, &mut T) -> U,
) {
    bench_with_env(bencher, setup, |env, data| {
        let mut analysis_env = AnalysisEnvironment::new(env);
        let result = run(&mut analysis_env, data);

        (result, analysis_env.into_skeleton())
    });
}

fn bench_simplify<'heap, T, U: 'heap>(
    bencher: &mut Bencher,
    setup: impl FnMut(&mut TypeBuilder<'_, 'heap>) -> T,
    mut run: impl FnMut(&mut SimplifyEnvironment<'_, 'heap>, &mut T) -> U,
) {
    bench_with_env(bencher, setup, |env, data| {
        let mut simplify_env = SimplifyEnvironment::new(env);
        let result = run(&mut simplify_env, data);

        (result, simplify_env.into_skeleton())
    });
}

fn bench_inference<'heap, T, U: 'heap>(
    bencher: &mut Bencher,
    setup: impl FnMut(&mut TypeBuilder<'_, 'heap>) -> T,
    mut run: impl FnMut(&mut InferenceEnvironment<'_, 'heap>, &mut T) -> U,
) {
    bench_with_env(bencher, setup, |env, data| {
        let mut inference_env = InferenceEnvironment::new(env);
        let output = run(&mut inference_env, data);

        let result = inference_env.into_solver().solve();
        debug_assert!(result.is_ok(), "benchmark should not produce diagnostics");

        (output, result)
    });
}

// =============================================================================
// Lattice Benchmarks
// =============================================================================

fn lattice(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("lattice");

    // Fast path: primitives (most common case)
    group.bench_function("join/primitives", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.integer(), builder.integer()),
            |lattice, &mut (lhs, rhs)| lattice.join(lhs, rhs),
        );
    });

    // Complex case: recursive types (stress tests coinductive handling)
    group.bench_function("join/recursive", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_recursive_type(builder),
                    create_recursive_type(builder),
                )
            },
            |lattice, &mut (lhs, rhs)| lattice.join(lhs, rhs),
        );
    });

    // Meet: fast path
    group.bench_function("meet/primitives", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.integer(), builder.integer()),
            |lattice, &mut (lhs, rhs)| lattice.meet(lhs, rhs),
        );
    });

    // Meet: recursive types (using simpler structure to avoid diagnostics)
    group.bench_function("meet/recursive", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_recursive_type(builder),
                    create_recursive_type(builder),
                )
            },
            |lattice, &mut (lhs, rhs)| lattice.meet(lhs, rhs),
        );
    });

    group.finish();
}

// =============================================================================
// Subtyping Benchmarks
// =============================================================================

fn subtyping(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("subtyping");

    // Fast path: primitives
    group.bench_function("primitives", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.integer(), builder.number()),
            |analysis, &mut (lhs, rhs)| analysis.is_subtype_of(Variance::Covariant, lhs, rhs),
        );
    });

    // Realistic workload: nested structures
    group.bench_function("nested_struct", |bencher| {
        bench_analysis(
            bencher,
            |builder| (create_nested_struct(builder), create_nested_struct(builder)),
            |analysis, &mut (lhs, rhs)| analysis.is_subtype_of(Variance::Covariant, lhs, rhs),
        );
    });

    // Different code path: contravariant closures
    group.bench_function("contravariant_closure", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                let sub = builder.closure([builder.number()], builder.integer());
                let sup = builder.closure([builder.integer()], builder.number());
                (sub, sup)
            },
            |analysis, &mut (lhs, rhs)| analysis.is_subtype_of(Variance::Covariant, lhs, rhs),
        );
    });

    group.finish();
}

// =============================================================================
// Simplification Benchmarks
// =============================================================================

fn simplify(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("simplify");

    // Case where simplification actually does work
    group.bench_function("union_with_duplicates", |bencher| {
        bench_simplify(
            bencher,
            |builder| {
                builder.union([
                    builder.string(),
                    builder.string(),
                    builder.integer(),
                    builder.integer(),
                    builder.never(),
                ])
            },
            |simplify, &mut type_id| simplify.simplify(type_id),
        );
    });

    group.finish();
}

// =============================================================================
// Inference Solver Benchmarks
// =============================================================================

fn inference(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("inference");

    // Anti-symmetry: tests Tarjan's SCC algorithm
    group.bench_function("anti_symmetry", |bencher| {
        bench_inference(
            bencher,
            |builder| {
                let hole1 = builder.fresh_hole();
                let hole2 = builder.fresh_hole();
                let hole3 = builder.fresh_hole();

                let var1 = Variable::synthetic(VariableKind::Hole(hole1));
                let var2 = Variable::synthetic(VariableKind::Hole(hole2));
                let var3 = Variable::synthetic(VariableKind::Hole(hole3));

                let string = builder.string();

                vec![
                    Constraint::Ordering {
                        lower: var1,
                        upper: var2,
                    },
                    Constraint::Ordering {
                        lower: var2,
                        upper: var3,
                    },
                    Constraint::Ordering {
                        lower: var3,
                        upper: var1,
                    },
                    Constraint::Equals {
                        variable: var1,
                        r#type: string,
                    },
                ]
            },
            |inference, constraints| {
                for constraint in constraints.iter().copied() {
                    inference.add_constraint(constraint);
                }
            },
        );
    });

    // Simple end-to-end: single inference variable
    group.bench_function("full_solve/simple", |bencher| {
        bench_inference(
            bencher,
            |builder| {
                let hole = builder.fresh_hole();

                (builder.infer(hole), builder.string())
            },
            |inference, &mut (subtype, supertype)| {
                inference.collect_constraints(Variance::Covariant, subtype, supertype);
            },
        );
    });

    // Complex end-to-end: multiple variables in nested structure
    group.bench_function("full_solve/complex", |bencher| {
        bench_inference(
            bencher,
            |builder| {
                let hole1 = builder.fresh_hole();
                let hole2 = builder.fresh_hole();

                let subtype = builder.r#struct([
                    ("data", builder.list(builder.infer(hole1))),
                    ("count", builder.infer(hole2)),
                ]);
                let supertype = builder.r#struct([
                    ("data", builder.list(builder.string())),
                    ("count", builder.integer()),
                ]);
                (subtype, supertype)
            },
            |inference, &mut (subtype, supertype)| {
                inference.collect_constraints(Variance::Covariant, subtype, supertype);
            },
        );
    });

    // Contravariant inference (different code path)
    group.bench_function("full_solve/contravariant", |bencher| {
        bench_inference(
            bencher,
            |builder| {
                let hole = builder.fresh_hole();

                let subtype = builder.closure([builder.infer(hole)], builder.boolean());
                let supertype = builder.closure([builder.integer()], builder.boolean());
                (subtype, supertype)
            },
            |inference, &mut (subtype, supertype)| {
                inference.collect_constraints(Variance::Covariant, subtype, supertype);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Entry Point
// =============================================================================

criterion_group!(benches, lattice, subtyping, simplify, inference);
criterion_main!(benches);
