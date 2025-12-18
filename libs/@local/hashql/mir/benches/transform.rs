#![feature(custom_test_frameworks)]
#![test_runner(criterion::runner)]
#![expect(clippy::min_ident_chars, clippy::many_single_char_names)]

use core::{hint::black_box, time::Duration};
use std::time::Instant;

use criterion::Criterion;
use criterion_macro::criterion;
use hashql_core::{
    heap::{BumpAllocator as _, Heap, Scratch},
    r#type::{TypeBuilder, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{
    body::Body,
    builder::BodyBuilder,
    context::MirContext,
    intern::Interner,
    op,
    pass::{
        TransformPass,
        transform::{CfgSimplify, DeadStoreElimination, Sroa},
    },
};

/// Creates a simple linear CFG body for benchmarking.
///
/// Structure:
/// ```text
/// bb0: x = 1; goto bb1
/// bb1: y = x == 2; goto bb2
/// bb2: z = y == 3; return z
/// ```
fn create_linear_cfg<'heap>(env: &Environment<'heap>, interner: &Interner<'heap>) -> Body<'heap> {
    let mut builder = BodyBuilder::new(interner);
    let int_ty = TypeBuilder::synthetic(env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let z = builder.local("z", int_ty);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .goto(bb1, []);

    builder
        .build_block(bb1)
        .assign_place(y, |rv| rv.binary(x, op![==], const_2))
        .goto(bb2, []);

    builder
        .build_block(bb2)
        .assign_place(z, |rv| rv.binary(y, op![==], const_3))
        .ret(z);

    builder.finish(0, TypeBuilder::synthetic(env).integer())
}

/// Creates a branching CFG body with a diamond pattern for benchmarking.
///
/// Structure:
/// ```text
/// bb0: switch(cond) -> [0: bb1, 1: bb2]
/// bb1: a = 10; goto bb3
/// bb2: b = 20; goto bb3
/// bb3(p): result = p; return result
/// ```
fn create_diamond_cfg<'heap>(env: &Environment<'heap>, interner: &Interner<'heap>) -> Body<'heap> {
    let mut builder = BodyBuilder::new(interner);
    let int_ty = TypeBuilder::synthetic(env).integer();

    let cond = builder.local("cond", int_ty);
    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let p = builder.local("p", int_ty);
    let result = builder.local("result", int_ty);

    let const_10 = builder.const_int(10);
    let const_20 = builder.const_int(20);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([p.local]);

    builder
        .build_block(bb0)
        .switch(cond, |switch| switch.case(0, bb1, []).case(1, bb2, []));

    builder
        .build_block(bb1)
        .assign_place(a, |rv| rv.load(const_10))
        .goto(bb3, [a.into()]);

    builder
        .build_block(bb2)
        .assign_place(b, |rv| rv.load(const_20))
        .goto(bb3, [b.into()]);

    builder
        .build_block(bb3)
        .assign_place(result, |rv| rv.load(p))
        .ret(result);

    builder.finish(1, TypeBuilder::synthetic(env).integer())
}

/// Creates a body with dead code for dead store elimination benchmarking.
///
/// Structure:
/// ```text
/// bb0: x = 1; dead1 = 100; dead2 = 200; y = x == 2; return y
/// ```
fn create_dead_store_cfg<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> Body<'heap> {
    let mut builder = BodyBuilder::new(interner);
    let int_ty = TypeBuilder::synthetic(env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let dead1 = builder.local("dead1", int_ty);
    let dead2 = builder.local("dead2", int_ty);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_100 = builder.const_int(100);
    let const_200 = builder.const_int(200);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(dead1, |rv| rv.load(const_100))
        .assign_place(dead2, |rv| rv.load(const_200))
        .assign_place(y, |rv| rv.binary(x, op![==], const_2))
        .ret(y);

    builder.finish(0, TypeBuilder::synthetic(env).integer())
}

/// Creates a larger CFG with multiple branches and join points for more realistic benchmarking.
///
/// Structure:
/// ```text
/// bb0: switch(cond) -> [0: bb1, 1: bb2, 2: bb3, otherwise: bb4]
/// bb1: a = 1; goto bb5
/// bb2: b = 2; goto bb5
/// bb3: c = 3; goto bb6
/// bb4: d = 4; goto bb6
/// bb5(p1): e = p1 == 10; goto bb7
/// bb6(p2): f = p2 == 20; goto bb7
/// bb7(p3): result = p3; return result
/// ```
fn create_complex_cfg<'heap>(env: &Environment<'heap>, interner: &Interner<'heap>) -> Body<'heap> {
    let mut builder = BodyBuilder::new(interner);
    let int_ty = TypeBuilder::synthetic(env).integer();

    let cond = builder.local("cond", int_ty);
    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let c = builder.local("c", int_ty);
    let d = builder.local("d", int_ty);
    let e = builder.local("e", int_ty);
    let f = builder.local("f", int_ty);
    let p1 = builder.local("p1", int_ty);
    let p2 = builder.local("p2", int_ty);
    let p3 = builder.local("p3", int_ty);
    let result = builder.local("result", int_ty);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let const_4 = builder.const_int(4);
    let const_10 = builder.const_int(10);
    let const_20 = builder.const_int(20);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);
    let bb4 = builder.reserve_block([]);
    let bb5 = builder.reserve_block([p1.local]);
    let bb6 = builder.reserve_block([p2.local]);
    let bb7 = builder.reserve_block([p3.local]);

    builder.build_block(bb0).switch(cond, |switch| {
        switch
            .case(0, bb1, [])
            .case(1, bb2, [])
            .case(2, bb3, [])
            .otherwise(bb4, [])
    });

    builder
        .build_block(bb1)
        .assign_place(a, |rv| rv.load(const_1))
        .goto(bb5, [a.into()]);

    builder
        .build_block(bb2)
        .assign_place(b, |rv| rv.load(const_2))
        .goto(bb5, [b.into()]);

    builder
        .build_block(bb3)
        .assign_place(c, |rv| rv.load(const_3))
        .goto(bb6, [c.into()]);

    builder
        .build_block(bb4)
        .assign_place(d, |rv| rv.load(const_4))
        .goto(bb6, [d.into()]);

    builder
        .build_block(bb5)
        .assign_place(e, |rv| rv.binary(p1, op![==], const_10))
        .goto(bb7, [e.into()]);

    builder
        .build_block(bb6)
        .assign_place(f, |rv| rv.binary(p2, op![==], const_20))
        .goto(bb7, [f.into()]);

    builder
        .build_block(bb7)
        .assign_place(result, |rv| rv.load(p3))
        .ret(result);

    builder.finish(1, TypeBuilder::synthetic(env).integer())
}

fn run_fn(
    iters: u64,
    body: for<'heap> fn(&Environment<'heap>, &Interner<'heap>) -> Body<'heap>,
    mut func: impl for<'env, 'heap> FnMut(&mut MirContext<'env, 'heap>, &mut Body<'heap>),
) -> Duration {
    let mut heap = Heap::new();
    let mut total = Duration::ZERO;

    for _ in 0..iters {
        heap.reset();
        let env = Environment::new(&heap);
        let interner = Interner::new(&heap);
        let mut body = black_box(body(&env, &interner));

        let mut context = MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        };

        let start = Instant::now();
        func(&mut context, &mut body);
        total += start.elapsed();

        drop(black_box(body));
    }

    total
}

fn run(
    iters: u64,
    body: for<'heap> fn(&Environment<'heap>, &Interner<'heap>) -> Body<'heap>,
    mut pass: impl for<'env, 'heap> TransformPass<'env, 'heap>,
) -> Duration {
    run_fn(
        iters,
        body,
        #[inline]
        |context, body| pass.run(context, body),
    )
}

#[criterion]
fn cfg_simplify(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("cfg_simplify");

    group.bench_function("linear", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_linear_cfg, CfgSimplify::new()));
    });
    group.bench_function("diamond", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_diamond_cfg, CfgSimplify::new()));
    });
    group.bench_function("complex", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_complex_cfg, CfgSimplify::new()));
    });
}

#[criterion]
fn sroa(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("sroa");

    group.bench_function("linear", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_linear_cfg, Sroa::new()));
    });
    group.bench_function("diamond", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_diamond_cfg, Sroa::new()));
    });
    group.bench_function("complex", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_complex_cfg, Sroa::new()));
    });
}

#[criterion]
fn dse(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("dse");

    group.bench_function("dead stores", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_dead_store_cfg, DeadStoreElimination::new()));
    });
    group.bench_function("linear", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_linear_cfg, DeadStoreElimination::new()));
    });
    group.bench_function("diamond", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_diamond_cfg, DeadStoreElimination::new()));
    });
    group.bench_function("complex", |bencher| {
        bencher.iter_custom(|iters| run(iters, create_complex_cfg, DeadStoreElimination::new()));
    });
}

#[criterion]
fn pipeline(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("pipeline");

    group.bench_function("linear", |bencher| {
        let mut scratch = Scratch::new();

        bencher.iter_custom(|iters| {
            run_fn(iters, create_linear_cfg, |context, body| {
                CfgSimplify::new_in(&mut scratch).run(context, body);
                Sroa::new_in(&mut scratch).run(context, body);
                DeadStoreElimination::new_in(&mut scratch).run(context, body);
            })
        });
    });
    group.bench_function("diamond", |bencher| {
        let mut scratch = Scratch::new();

        bencher.iter_custom(|iters| {
            run_fn(iters, create_diamond_cfg, |context, body| {
                CfgSimplify::new_in(&mut scratch).run(context, body);
                Sroa::new_in(&mut scratch).run(context, body);
                DeadStoreElimination::new_in(&mut scratch).run(context, body);
            })
        });
    });
    group.bench_function("complex", |bencher| {
        let mut scratch = Scratch::new();

        bencher.iter_custom(|iters| {
            run_fn(iters, create_complex_cfg, |context, body| {
                CfgSimplify::new_in(&mut scratch).run(context, body);
                Sroa::new_in(&mut scratch).run(context, body);
                DeadStoreElimination::new_in(&mut scratch).run(context, body);
            })
        });
    });
}
