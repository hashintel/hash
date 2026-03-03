#![expect(
    clippy::min_ident_chars,
    clippy::many_single_char_names,
    clippy::significant_drop_tightening,
    clippy::similar_names
)]

#[path = "common/run.rs"]
mod run;

use codspeed_criterion_compat::{Criterion, criterion_group, criterion_main};
use hashql_core::{
    heap::ResetAllocator as _,
    id::IdSlice,
    r#type::{TypeBuilder, environment::Environment},
};
use hashql_mir::{
    body::Body,
    builder::{BodyBuilder, body},
    def::DefId,
    intern::Interner,
    op,
    pass::{
        GlobalTransformPass as _, GlobalTransformState, TransformPass as _,
        transform::{
            CfgSimplify, DeadStoreElimination, ForwardSubstitution, Inline, InlineConfig,
            InstSimplify, PostInline, PreInline,
        },
    },
};

use self::run::run_bencher;

/// Creates a simple linear CFG body for benchmarking.
///
/// Structure:
/// ```text
/// bb0: x = 1; goto bb1
/// bb1: y = x == 2; goto bb2
/// bb2: z = y == 3; return z
/// ```
fn create_linear_cfg<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> [Body<'heap>; 1] {
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

    let mut body = builder.finish(0, TypeBuilder::synthetic(env).integer());
    body.id = DefId::new(0);

    [body]
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
fn create_diamond_cfg<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> [Body<'heap>; 1] {
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

    let mut body = builder.finish(1, TypeBuilder::synthetic(env).integer());
    body.id = DefId::new(0);
    [body]
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
) -> [Body<'heap>; 1] {
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

    let mut body = builder.finish(0, TypeBuilder::synthetic(env).integer());
    body.id = DefId::new(0);
    [body]
}

/// Creates a body with patterns that `InstSimplify` can optimize.
///
/// Structure:
/// ```text
/// bb0:
///     a = 1 == 2              // const fold -> false
///     b = 3 < 5               // const fold -> true
///     c = b && true           // identity -> b
///     x = 42
///     y = x & x               // idempotent -> x
///     d = x == x              // identical operand -> true
///     e = a || c              // const fold (a=false, c=true) -> true
///     f = e && d              // const fold -> true
///     return f
/// ```
fn create_inst_simplify_cfg<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> [Body<'heap>; 1] {
    let mut builder = BodyBuilder::new(interner);
    let int_ty = TypeBuilder::synthetic(env).integer();
    let bool_ty = TypeBuilder::synthetic(env).boolean();

    let a = builder.local("a", bool_ty);
    let b = builder.local("b", bool_ty);
    let c = builder.local("c", bool_ty);
    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let d = builder.local("d", bool_ty);
    let e = builder.local("e", bool_ty);
    let f = builder.local("f", bool_ty);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let const_5 = builder.const_int(5);
    let const_42 = builder.const_int(42);
    let const_true = builder.const_bool(true);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(a, |rv| rv.binary(const_1, op![==], const_2))
        .assign_place(b, |rv| rv.binary(const_3, op![<], const_5))
        .assign_place(c, |rv| rv.binary(b, op![&], const_true))
        .assign_place(x, |rv| rv.load(const_42))
        .assign_place(y, |rv| rv.binary(x, op![&], x))
        .assign_place(d, |rv| rv.binary(x, op![==], x))
        .assign_place(e, |rv| rv.binary(a, op![|], c))
        .assign_place(f, |rv| rv.binary(e, op![&], d))
        .ret(f);

    let mut body = builder.finish(0, TypeBuilder::synthetic(env).boolean());
    body.id = DefId::new(0);
    [body]
}

/// Creates a complex CFG with nested loops, back edges, unreachable blocks, and deep nesting.
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
fn create_complex_cfg<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> [Body<'heap>; 1] {
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

    let mut body = builder.finish(1, TypeBuilder::synthetic(env).integer());
    body.id = DefId::new(0);
    [body]
}

/// Creates multiple bodies for inlining benchmarks: a caller with call sites and a callee.
///
/// The caller has multiple call sites in different control flow paths.
///
/// Structure:
/// ```text
/// callee (DefId 0):
///   bb0(arg): cond = arg < 5; if cond then bb1() else bb2()
///   bb1: r1 = arg == 0; return r1
///   bb2: r2 = arg > 10; return r2
///
/// caller (DefId 1):
///   bb0: switch mode [0 => bb1, 1 => bb2, _ => bb3]
///   bb1: x1 = apply callee, 3; goto bb4(x1)
///   bb2: x2 = apply callee, 7; goto bb4(x2)
///   bb3: x3 = apply callee, 0; goto bb4(x3)
///   bb4(p): return p
/// ```
fn create_inlinable_cfg<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> [Body<'heap>; 2] {
    let callee_id = DefId::new(0);
    let caller_id = DefId::new(1);

    // Callee: non-trivial function with control flow
    // Takes one Int arg, returns Bool based on comparisons
    let callee = body!(interner, env; fn@callee_id/1 -> Bool {
        decl arg0: Int, cond0: Bool, r1: Bool, r2: Bool;

        bb0() {
            cond0 = bin.< arg0 5;
            if cond0 then bb1() else bb2();
        },
        bb1() {
            r1 = bin.== arg0 0;
            return r1;
        },
        bb2() {
            r2 = bin.> arg0 10;
            return r2;
        }
    });

    // Caller: calls callee from multiple paths
    let caller = body!(interner, env; fn@caller_id/1 -> Bool {
        decl mode0: Int, x1: Bool, x2: Bool, x3: Bool, p4: Bool;

        bb0() {
            switch mode0 [0 => bb1(), 1 => bb2(), _ => bb3()];
        },
        bb1() {
            x1 = apply callee_id, 3;
            goto bb4(x1);
        },
        bb2() {
            x2 = apply callee_id, 7;
            goto bb4(x2);
        },
        bb3() {
            x3 = apply callee_id, 0;
            goto bb4(x3);
        },
        bb4(p4) {
            return p4;
        }
    });

    [callee, caller]
}

fn cfg_simplify(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("cfg_simplify");

    group.bench_function("linear", |bencher| {
        run_bencher(bencher, create_linear_cfg, |context, [body], scratch| {
            CfgSimplify::new_in(scratch).run(context, body)
        });
    });

    group.bench_function("diamond", |bencher| {
        run_bencher(bencher, create_diamond_cfg, |context, [body], scratch| {
            CfgSimplify::new_in(scratch).run(context, body)
        });
    });

    group.bench_function("complex", |bencher| {
        run_bencher(bencher, create_complex_cfg, |context, [body], scratch| {
            CfgSimplify::new_in(scratch).run(context, body)
        });
    });
}

fn forward_substitution(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("forward_substitution");

    group.bench_function("linear", |bencher| {
        run_bencher(bencher, create_linear_cfg, |context, [body], scratch| {
            ForwardSubstitution::new_in(scratch).run(context, body)
        });
    });

    group.bench_function("diamond", |bencher| {
        run_bencher(bencher, create_diamond_cfg, |context, [body], scratch| {
            ForwardSubstitution::new_in(scratch).run(context, body)
        });
    });

    group.bench_function("complex", |bencher| {
        run_bencher(bencher, create_complex_cfg, |context, [body], scratch| {
            ForwardSubstitution::new_in(scratch).run(context, body)
        });
    });
}

fn dse(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("dse");

    group.bench_function("dead stores", |bencher| {
        run_bencher(
            bencher,
            create_dead_store_cfg,
            |context, [body], scratch| DeadStoreElimination::new_in(scratch).run(context, body),
        );
    });

    group.bench_function("linear", |bencher| {
        run_bencher(bencher, create_linear_cfg, |context, [body], scratch| {
            DeadStoreElimination::new_in(scratch).run(context, body)
        });
    });

    group.bench_function("diamond", |bencher| {
        run_bencher(bencher, create_diamond_cfg, |context, [body], scratch| {
            DeadStoreElimination::new_in(scratch).run(context, body)
        });
    });

    group.bench_function("complex", |bencher| {
        run_bencher(bencher, create_complex_cfg, |context, [body], scratch| {
            DeadStoreElimination::new_in(scratch).run(context, body)
        });
    });
}

fn inst_simplify(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("inst_simplify");

    group.bench_function("foldable", |bencher| {
        run_bencher(
            bencher,
            create_inst_simplify_cfg,
            |context, [body], scratch| InstSimplify::new_in(scratch).run(context, body),
        );
    });
    group.bench_function("linear", |bencher| {
        run_bencher(bencher, create_linear_cfg, |context, [body], scratch| {
            InstSimplify::new_in(scratch).run(context, body)
        });
    });

    group.bench_function("diamond", |bencher| {
        run_bencher(bencher, create_diamond_cfg, |context, [body], scratch| {
            InstSimplify::new_in(scratch).run(context, body)
        });
    });

    group.bench_function("complex", |bencher| {
        run_bencher(bencher, create_complex_cfg, |context, [body], scratch| {
            InstSimplify::new_in(scratch).run(context, body)
        });
    });
}

fn pipeline(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("pipeline");

    group.bench_function("linear", |bencher| {
        run_bencher(bencher, create_linear_cfg, |context, bodies, scratch| {
            let bodies = IdSlice::from_raw_mut(bodies);
            let mut state = GlobalTransformState::new_in(bodies, context.heap);

            let mut changed = PreInline::new_in(&mut *scratch).run(context, &mut state, bodies);
            scratch.reset();
            changed |= Inline::new_in(InlineConfig::default(), &mut *scratch)
                .run(context, &mut state, bodies);
            scratch.reset();
            changed |=
                PostInline::new_in(context.heap, &mut *scratch).run(context, &mut state, bodies);
            scratch.reset();
            changed
        });
    });
    group.bench_function("diamond", |bencher| {
        run_bencher(bencher, create_diamond_cfg, |context, bodies, scratch| {
            let bodies = IdSlice::from_raw_mut(bodies);
            let mut state = GlobalTransformState::new_in(bodies, context.heap);

            let mut changed = PreInline::new_in(&mut *scratch).run(context, &mut state, bodies);
            scratch.reset();
            changed |= Inline::new_in(InlineConfig::default(), &mut *scratch)
                .run(context, &mut state, bodies);
            scratch.reset();
            changed |=
                PostInline::new_in(context.heap, &mut *scratch).run(context, &mut state, bodies);
            scratch.reset();
            changed
        });
    });
    group.bench_function("complex", |bencher| {
        run_bencher(bencher, create_complex_cfg, |context, bodies, scratch| {
            let bodies = IdSlice::from_raw_mut(bodies);
            let mut state = GlobalTransformState::new_in(bodies, context.heap);

            let mut changed = PreInline::new_in(&mut *scratch).run(context, &mut state, bodies);
            scratch.reset();
            changed |= Inline::new_in(InlineConfig::default(), &mut *scratch)
                .run(context, &mut state, bodies);
            scratch.reset();
            changed |=
                PostInline::new_in(context.heap, &mut *scratch).run(context, &mut state, bodies);
            scratch.reset();
            changed
        });
    });
    group.bench_function("inline", |bencher| {
        run_bencher(bencher, create_inlinable_cfg, |context, bodies, scratch| {
            let bodies = IdSlice::from_raw_mut(bodies);
            let mut state = GlobalTransformState::new_in(bodies, context.heap);

            let mut changed = PreInline::new_in(&mut *scratch).run(context, &mut state, bodies);
            scratch.reset();
            changed |= Inline::new_in(InlineConfig::default(), &mut *scratch)
                .run(context, &mut state, bodies);
            scratch.reset();
            changed |=
                PostInline::new_in(context.heap, &mut *scratch).run(context, &mut state, bodies);
            scratch.reset();
            changed
        });
    });
}

criterion_group!(
    benches,
    cfg_simplify,
    forward_substitution,
    dse,
    inst_simplify,
    pipeline
);
criterion_main!(benches);
