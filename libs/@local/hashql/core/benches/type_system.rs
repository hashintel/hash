#![expect(
    clippy::min_ident_chars,
    clippy::significant_drop_tightening,
    clippy::too_many_lines
)]

use core::hint::black_box;

use codspeed_criterion_compat::{BatchSize, Bencher, Criterion, criterion_group, criterion_main};
use hashql_core::{
    heap::{BumpAllocator as _, Heap},
    symbol::Ident,
    r#type::{
        TypeId,
        builder::{TypeBuilder, lazy},
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance,
        },
    },
};

// =============================================================================
// Type Fixtures
// =============================================================================

fn create_simple_struct(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.r#struct([
        ("name", builder.string()),
        ("age", builder.integer()),
        ("active", builder.boolean()),
    ])
}

fn create_nested_struct(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.r#struct([
        ("user", create_simple_struct(builder)),
        (
            "metadata",
            builder.r#struct([("created", builder.string()), ("updated", builder.string())]),
        ),
    ])
}

fn create_simple_tuple(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.tuple([builder.integer(), builder.string(), builder.boolean()])
}

fn create_nested_tuple(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.tuple([
        builder.tuple([builder.integer(), builder.integer()]),
        builder.tuple([builder.string(), builder.string()]),
        builder.boolean(),
    ])
}

fn create_simple_union(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.union([builder.string(), builder.integer(), builder.null()])
}

fn create_nested_union(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.union([
        builder.union([builder.string(), builder.integer()]),
        builder.union([builder.boolean(), builder.null()]),
    ])
}

fn create_wide_union(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.union([
        builder.string(),
        builder.integer(),
        builder.number(),
        builder.boolean(),
        builder.null(),
        builder.r#struct([("x", builder.integer())]),
        builder.tuple([builder.string()]),
    ])
}

fn create_simple_intersection(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.intersection([
        builder.r#struct([("name", builder.string())]),
        builder.r#struct([("age", builder.integer())]),
    ])
}

fn create_nested_intersection(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.intersection([
        builder.intersection([
            builder.r#struct([("a", builder.string())]),
            builder.r#struct([("b", builder.integer())]),
        ]),
        builder.r#struct([("c", builder.boolean())]),
    ])
}

fn create_simple_closure(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.closure([builder.string(), builder.integer()], builder.boolean())
}

fn create_complex_closure(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.closure(
        [
            builder.r#struct([("x", builder.integer()), ("y", builder.integer())]),
            builder.list(builder.string()),
        ],
        builder.union([builder.string(), builder.null()]),
    )
}

fn create_list_type(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.list(builder.string())
}

fn create_nested_list(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.list(builder.list(builder.integer()))
}

fn create_dict_type(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.dict(builder.string(), builder.integer())
}

fn create_recursive_type(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.tuple(lazy(|id, builder| [builder.integer(), id.value()]))
}

fn create_deep_recursive_type(builder: &TypeBuilder<'_, '_>) -> TypeId {
    builder.r#struct(lazy(|id, builder| {
        [
            ("value", builder.integer()),
            ("left", builder.union([id.value(), builder.null()])),
            ("right", builder.union([id.value(), builder.null()])),
        ]
    }))
}

fn create_generic_type(builder: &mut TypeBuilder<'_, '_>) -> TypeId {
    let t = builder.fresh_argument("T");
    builder.generic([(t, None)], builder.list(builder.param(t)))
}

fn create_applied_type(builder: &mut TypeBuilder<'_, '_>) -> TypeId {
    let t = builder.fresh_argument("T");
    let generic = builder.generic([(t, None)], builder.list(builder.param(t)));
    builder.apply([(t, builder.string())], generic)
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
    // NOTE: `heap` must not be moved or reassigned; `heap_ptr` assumes its address is stable
    // for the entire duration of this function.
    let mut heap = Heap::new();
    let heap_ptr = &raw mut heap;

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
        let mut lattice_env = LatticeEnvironment::new(env);
        let data = run(&mut lattice_env, data);

        (data, lattice_env.into_skeleton())
    });
}

fn bench_analysis<'heap, T, U: 'heap>(
    bencher: &mut Bencher,
    setup: impl FnMut(&mut TypeBuilder<'_, 'heap>) -> T,
    mut run: impl FnMut(&mut AnalysisEnvironment<'_, 'heap>, &mut T) -> U,
) {
    bench_with_env(bencher, setup, |env, data| {
        let mut analysis_env = AnalysisEnvironment::new(env);
        let data = run(&mut analysis_env, data);

        (data, analysis_env.into_skeleton())
    });
}

fn bench_simplify<'heap, T, U: 'heap>(
    bencher: &mut Bencher,
    setup: impl FnMut(&mut TypeBuilder<'_, 'heap>) -> T,
    mut run: impl FnMut(&mut SimplifyEnvironment<'_, 'heap>, &mut T) -> U,
) {
    bench_with_env(bencher, setup, |env, data| {
        let mut analysis_env = SimplifyEnvironment::new(env);
        let data = run(&mut analysis_env, data);

        (data, analysis_env.into_skeleton())
    });
}

// =============================================================================
// Lattice Benchmarks: Join
// =============================================================================

fn lattice_join(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("lattice/join");

    group.bench_function("primitives/same", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.integer(), builder.integer()),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("primitives/different", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.integer(), builder.string()),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("primitives/subtype", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.integer(), builder.number()),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("never_identity", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.never(), builder.string()),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("unknown_absorb", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.unknown(), builder.string()),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("structs/same_shape", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_simple_struct(builder), create_simple_struct(builder)),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("structs/nested", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_nested_struct(builder), create_nested_struct(builder)),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("tuples/same_shape", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_simple_tuple(builder), create_simple_tuple(builder)),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("unions/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_simple_union(builder), create_simple_union(builder)),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("unions/nested", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_nested_union(builder), create_nested_union(builder)),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("unions/wide", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_wide_union(builder), create_wide_union(builder)),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("intersections/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_simple_intersection(builder),
                    create_simple_intersection(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("closures/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_simple_closure(builder),
                    create_simple_closure(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("closures/complex", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_complex_closure(builder),
                    create_complex_closure(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("lists/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_list_type(builder), create_list_type(builder)),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("lists/nested", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_nested_list(builder), create_nested_list(builder)),
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("recursive/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_recursive_type(builder),
                    create_recursive_type(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.bench_function("recursive/deep", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_deep_recursive_type(builder),
                    create_deep_recursive_type(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.join(a, b);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Lattice Benchmarks: Meet
// =============================================================================

fn lattice_meet(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("lattice/meet");

    group.bench_function("primitives/same", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.integer(), builder.integer()),
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("primitives/different", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.integer(), builder.string()),
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("primitives/subtype", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.integer(), builder.number()),
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("unknown_identity", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.unknown(), builder.string()),
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("never_absorb", |bencher| {
        bench_lattice(
            bencher,
            |builder| (builder.never(), builder.string()),
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("structs/same_shape", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_simple_struct(builder), create_simple_struct(builder)),
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("unions/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_simple_union(builder), create_simple_union(builder)),
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("unions/wide", |bencher| {
        bench_lattice(
            bencher,
            |builder| (create_wide_union(builder), create_wide_union(builder)),
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("intersections/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_simple_intersection(builder),
                    create_simple_intersection(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("intersections/nested", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_nested_intersection(builder),
                    create_nested_intersection(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("closures/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_simple_closure(builder),
                    create_simple_closure(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.bench_function("recursive/simple", |bencher| {
        bench_lattice(
            bencher,
            |builder| {
                (
                    create_recursive_type(builder),
                    create_recursive_type(builder),
                )
            },
            |lattice, &mut (a, b)| {
                lattice.meet(a, b);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Analysis Benchmarks: Subtyping
// =============================================================================

fn analysis_subtyping(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("analysis/is_subtype_of");

    group.bench_function("primitives/same", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.integer(), builder.integer()),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("primitives/integer_number", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.integer(), builder.number()),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("primitives/incompatible", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.string(), builder.integer()),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("never_bottom", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.never(), builder.string()),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("unknown_top", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.string(), builder.unknown()),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("structs/same", |bencher| {
        bench_analysis(
            bencher,
            |builder| (create_simple_struct(builder), create_simple_struct(builder)),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("structs/nested", |bencher| {
        bench_analysis(
            bencher,
            |builder| (create_nested_struct(builder), create_nested_struct(builder)),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("unions/element_of", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.string(), create_simple_union(builder)),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("unions/wide", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.string(), create_wide_union(builder)),
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("closures/simple", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                (
                    create_simple_closure(builder),
                    create_simple_closure(builder),
                )
            },
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("closures/contravariant", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                let sub = builder.closure([builder.number()], builder.integer());
                let sup = builder.closure([builder.integer()], builder.number());
                (sub, sup)
            },
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("lists/element_subtype", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                (
                    builder.list(builder.integer()),
                    builder.list(builder.number()),
                )
            },
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.bench_function("recursive/covariant", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                let a = builder.tuple(lazy(|id, builder| [builder.integer(), id.value()]));
                let b = builder.tuple(lazy(|id, builder| [builder.number(), id.value()]));
                (a, b)
            },
            |analysis, &mut (a, b)| {
                analysis.is_subtype_of(Variance::Covariant, a, b);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Analysis Benchmarks: Equivalence
// =============================================================================

fn analysis_equivalence(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("analysis/is_equivalent");

    group.bench_function("primitives/same", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.integer(), builder.integer()),
            |analysis, &mut (a, b)| {
                analysis.is_equivalent(a, b);
            },
        );
    });

    group.bench_function("primitives/different", |bencher| {
        bench_analysis(
            bencher,
            |builder| (builder.integer(), builder.string()),
            |analysis, &mut (a, b)| {
                analysis.is_equivalent(a, b);
            },
        );
    });

    group.bench_function("structs/equivalent", |bencher| {
        bench_analysis(
            bencher,
            |builder| (create_simple_struct(builder), create_simple_struct(builder)),
            |analysis, &mut (a, b)| {
                analysis.is_equivalent(a, b);
            },
        );
    });

    group.bench_function("unions/equivalent", |bencher| {
        bench_analysis(
            bencher,
            |builder| (create_simple_union(builder), create_simple_union(builder)),
            |analysis, &mut (a, b)| {
                analysis.is_equivalent(a, b);
            },
        );
    });

    group.bench_function("recursive/equivalent", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                (
                    create_recursive_type(builder),
                    create_recursive_type(builder),
                )
            },
            |analysis, &mut (a, b)| {
                analysis.is_equivalent(a, b);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Analysis Benchmarks: Type Properties
// =============================================================================

fn analysis_properties(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("analysis/properties");

    group.bench_function("is_bottom/never", |bencher| {
        bench_analysis(
            bencher,
            |builder| builder.never(),
            |analysis, &mut ty| {
                analysis.is_bottom(ty);
            },
        );
    });

    group.bench_function("is_bottom/primitive", |bencher| {
        bench_analysis(
            bencher,
            |builder| builder.integer(),
            |analysis, &mut ty| {
                analysis.is_bottom(ty);
            },
        );
    });

    group.bench_function("is_bottom/empty_union", |bencher| {
        bench_analysis(
            bencher,
            |builder| builder.union([builder.never(), builder.never()]),
            |analysis, &mut ty| {
                analysis.is_bottom(ty);
            },
        );
    });

    group.bench_function("is_top/unknown", |bencher| {
        bench_analysis(
            bencher,
            |builder| builder.unknown(),
            |analysis, &mut ty| {
                analysis.is_top(ty);
            },
        );
    });

    group.bench_function("is_top/primitive", |bencher| {
        bench_analysis(
            bencher,
            |builder| builder.integer(),
            |analysis, &mut ty| {
                analysis.is_top(ty);
            },
        );
    });

    group.bench_function("is_concrete/primitive", |bencher| {
        bench_analysis(
            bencher,
            |builder| builder.integer(),
            |analysis, &mut ty| {
                analysis.is_concrete(ty);
            },
        );
    });

    group.bench_function("is_concrete/struct", |bencher| {
        bench_analysis(
            bencher,
            |builder| create_simple_struct(builder),
            |analysis, &mut ty| {
                analysis.is_concrete(ty);
            },
        );
    });

    group.bench_function("is_concrete/nested_struct", |bencher| {
        bench_analysis(
            bencher,
            |builder| create_nested_struct(builder),
            |analysis, &mut ty| {
                analysis.is_concrete(ty);
            },
        );
    });

    group.bench_function("is_concrete/union", |bencher| {
        bench_analysis(
            bencher,
            |builder| create_wide_union(builder),
            |analysis, &mut ty| {
                analysis.is_concrete(ty);
            },
        );
    });

    group.bench_function("is_recursive/non_recursive", |bencher| {
        bench_analysis(
            bencher,
            |builder| create_simple_struct(builder),
            |analysis, &mut ty| {
                analysis.is_recursive(ty);
            },
        );
    });

    group.bench_function("is_recursive/recursive", |bencher| {
        bench_analysis(
            bencher,
            |builder| create_recursive_type(builder),
            |analysis, &mut ty| {
                analysis.is_recursive(ty);
            },
        );
    });

    group.bench_function("is_recursive/deep_recursive", |bencher| {
        bench_analysis(
            bencher,
            |builder| create_deep_recursive_type(builder),
            |analysis, &mut ty| {
                analysis.is_recursive(ty);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Distribution Benchmarks
// =============================================================================

fn analysis_distribution(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("analysis/distribution");

    group.bench_function("distribute_union/list_of_union", |bencher| {
        bench_analysis(
            bencher,
            |builder| builder.list(builder.union([builder.string(), builder.integer()])),
            |analysis, &mut ty| {
                analysis.distribute_union(ty);
            },
        );
    });

    group.bench_function("distribute_union/tuple_of_union", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                builder.tuple([
                    builder.union([builder.string(), builder.integer()]),
                    builder.boolean(),
                ])
            },
            |analysis, &mut ty| {
                analysis.distribute_union(ty);
            },
        );
    });

    group.bench_function("distribute_union/struct_with_union", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                builder.r#struct([
                    (
                        "value",
                        builder.union([builder.string(), builder.integer()]),
                    ),
                    ("flag", builder.boolean()),
                ])
            },
            |analysis, &mut ty| {
                analysis.distribute_union(ty);
            },
        );
    });

    group.bench_function("distribute_intersection/list", |bencher| {
        bench_analysis(
            bencher,
            |builder| {
                builder.list(builder.intersection([
                    builder.r#struct([("a", builder.string())]),
                    builder.r#struct([("b", builder.integer())]),
                ]))
            },
            |analysis, &mut ty| {
                analysis.distribute_intersection(ty);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Simplify Benchmarks
// =============================================================================

fn simplify(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("simplify");

    group.bench_function("primitive", |bencher| {
        bench_simplify(
            bencher,
            |builder| builder.integer(),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("struct/simple", |bencher| {
        bench_simplify(
            bencher,
            |builder| create_simple_struct(builder),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("struct/nested", |bencher| {
        bench_simplify(
            bencher,
            |builder| create_nested_struct(builder),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("union/simple", |bencher| {
        bench_simplify(
            bencher,
            |builder| create_simple_union(builder),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("union/nested", |bencher| {
        bench_simplify(
            bencher,
            |builder| create_nested_union(builder),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("union/wide", |bencher| {
        bench_simplify(
            bencher,
            |builder| create_wide_union(builder),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("union/with_duplicates", |bencher| {
        bench_simplify(
            bencher,
            |builder| {
                builder.union([
                    builder.string(),
                    builder.string(),
                    builder.integer(),
                    builder.integer(),
                ])
            },
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("union/with_never", |bencher| {
        bench_simplify(
            bencher,
            |builder| {
                builder.union([
                    builder.string(),
                    builder.never(),
                    builder.integer(),
                    builder.never(),
                ])
            },
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("intersection/simple", |bencher| {
        bench_simplify(
            bencher,
            |builder| create_simple_intersection(builder),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("intersection/nested", |bencher| {
        bench_simplify(
            bencher,
            |builder| create_nested_intersection(builder),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("intersection/with_unknown", |bencher| {
        bench_simplify(
            bencher,
            |builder| {
                builder.intersection([
                    builder.r#struct([("a", builder.string())]),
                    builder.unknown(),
                ])
            },
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("union_intersection_nested", |bencher| {
        bench_simplify(
            bencher,
            |builder| {
                builder.intersection([
                    builder.union([builder.integer(), builder.string()]),
                    builder.string(),
                ])
            },
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.bench_function("recursive/simple", |bencher| {
        bench_simplify(
            bencher,
            |builder| create_recursive_type(builder),
            |simplify, &mut ty| {
                simplify.simplify(ty);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Projection Benchmarks
// =============================================================================

fn projection(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("lattice/projection");

    group.bench_function("struct/existing_field", |bencher| {
        bench_with_env(
            bencher,
            |builder| {
                (
                    create_simple_struct(builder),
                    builder.env.heap.intern_symbol("name"),
                )
            },
            |env, &mut (ty, field_sym)| {
                let mut lattice = LatticeEnvironment::new(env);
                lattice.projection(ty, Ident::synthetic(field_sym));
            },
        );
    });

    group.bench_function("struct/nested_field", |bencher| {
        bench_with_env(
            bencher,
            |builder| {
                (
                    create_nested_struct(builder),
                    builder.env.heap.intern_symbol("user"),
                )
            },
            |env, &mut (ty, field_sym)| {
                let mut lattice = LatticeEnvironment::new(env);
                lattice.projection(ty, Ident::synthetic(field_sym));
            },
        );
    });

    group.bench_function("struct/missing_field", |bencher| {
        bench_with_env(
            bencher,
            |builder| {
                (
                    create_simple_struct(builder),
                    builder.env.heap.intern_symbol("nonexistent"),
                )
            },
            |env, &mut (ty, field_sym)| {
                let mut lattice = LatticeEnvironment::new(env);
                lattice.projection(ty, Ident::synthetic(field_sym));
            },
        );
    });

    group.bench_function("union/common_field", |bencher| {
        bench_with_env(
            bencher,
            |builder| {
                let ty = builder.union([
                    builder.r#struct([("id", builder.integer()), ("name", builder.string())]),
                    builder.r#struct([("id", builder.integer()), ("value", builder.number())]),
                ]);
                (ty, builder.env.heap.intern_symbol("id"))
            },
            |env, &mut (ty, field_sym)| {
                let mut lattice = LatticeEnvironment::new(env);
                lattice.projection(ty, Ident::synthetic(field_sym));
            },
        );
    });

    group.finish();
}

// =============================================================================
// Subscript Benchmarks
// =============================================================================

fn subscript(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("lattice/subscript");

    group.bench_function("list/integer_index", |bencher| {
        bench_with_env(
            bencher,
            |builder| (create_list_type(builder), builder.integer()),
            |env, &mut (ty, index)| {
                let mut lattice = LatticeEnvironment::new(env);
                let mut inference = InferenceEnvironment::new(env);
                lattice.subscript(ty, index, &mut inference);
            },
        );
    });

    group.bench_function("list/nested", |bencher| {
        bench_with_env(
            bencher,
            |builder| (create_nested_list(builder), builder.integer()),
            |env, &mut (ty, index)| {
                let mut lattice = LatticeEnvironment::new(env);
                let mut inference = InferenceEnvironment::new(env);
                lattice.subscript(ty, index, &mut inference);
            },
        );
    });

    group.bench_function("dict/string_key", |bencher| {
        bench_with_env(
            bencher,
            |builder| (create_dict_type(builder), builder.string()),
            |env, &mut (ty, index)| {
                let mut lattice = LatticeEnvironment::new(env);
                let mut inference = InferenceEnvironment::new(env);
                lattice.subscript(ty, index, &mut inference);
            },
        );
    });

    group.bench_function("tuple/integer_index", |bencher| {
        bench_with_env(
            bencher,
            |builder| (create_simple_tuple(builder), builder.integer()),
            |env, &mut (ty, index)| {
                let mut lattice = LatticeEnvironment::new(env);
                let mut inference = InferenceEnvironment::new(env);
                lattice.subscript(ty, index, &mut inference);
            },
        );
    });

    group.finish();
}

// =============================================================================
// Entry Point
// =============================================================================

criterion_group!(lattice_benches, lattice_join, lattice_meet,);

criterion_group!(
    analysis_benches,
    analysis_subtyping,
    analysis_equivalence,
    analysis_properties,
    analysis_distribution,
);

criterion_group!(simplify_benches, simplify,);

criterion_group!(access_benches, projection, subscript,);

criterion_main!(
    lattice_benches,
    analysis_benches,
    simplify_benches,
    access_benches,
);
