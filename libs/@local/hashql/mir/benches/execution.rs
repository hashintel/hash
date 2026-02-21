#![expect(clippy::significant_drop_tightening)]
#![feature(allocator_api)]

extern crate alloc;

#[path = "common/run.rs"]
mod run;

use codspeed_criterion_compat::{Criterion, criterion_group, criterion_main};
use hashql_core::{heap::ResetAllocator as _, symbol::sym, r#type::environment::Environment};
use hashql_mir::{
    body::Body,
    builder::body,
    def::DefIdSlice,
    intern::Interner,
    pass::{
        Changed, GlobalAnalysisPass as _, TransformPass as _,
        analysis::size_estimation::SizeEstimationAnalysis, transform::TraversalExtraction,
    },
};

use self::run::run_bencher;

/// Single block, no entity projections — pure arithmetic.
fn create_simple<'heap>(env: &Environment<'heap>, interner: &Interner<'heap>) -> [Body<'heap>; 1] {
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             x: Int, y: Int, sum: Int, result: Bool;

        bb0() {
            x = load 10;
            y = load 20;
            sum = bin.+ x y;
            result = bin.> sum 15;
            return result;
        }
    });

    [body]
}

/// Multiple entity field projections (metadata.archived + encodings.vectors).
fn create_entity_projections<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> [Body<'heap>; 1] {
    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             archived: Bool, vectors: ?, result: ?;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool,
              encodings = vertex.encodings: ?, vectors_proj = encodings.vectors: ?;

        bb0() {
            archived = load archived_proj;
            vectors = load vectors_proj;
            result = load vectors;
            return result;
        }
    });

    [body]
}

/// Diamond CFG with mixed targets.
fn create_diamond_cfg<'heap>(
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
) -> [Body<'heap>; 1] {
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             archived: Bool, cond: Bool, x: Int, y: Int, result: Bool;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool;

        bb0() {
            archived = load archived_proj;
            cond = un.! archived;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 10;
            goto bb3(x);
        },
        bb2() {
            y = load 20;
            goto bb3(y);
        },
        bb3(x) {
            result = bin.> x 5;
            return result;
        }
    });

    [body]
}

fn execution_analysis(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("execution_analysis");

    group.bench_function("simple", |bencher| {
        run_bencher(bencher, create_simple, |context, [body], scratch| {
            let mut extraction = TraversalExtraction::new_in(&mut *scratch);
            let _: Changed = extraction.run(context, body);
            let traversals = extraction
                .take_traversals()
                .expect("expected GraphReadFilter body");
            scratch.reset();

            let mut size_analysis = SizeEstimationAnalysis::new_in(&*scratch);
            size_analysis.run(context, DefIdSlice::from_raw(core::slice::from_ref(&*body)));
            let footprints = size_analysis.finish();
            scratch.reset();

            let bodies = [Some(traversals)];

            let analysis = hashql_mir::pass::execution::ExecutionAnalysis {
                traversals: DefIdSlice::from_raw(&bodies),
                footprints: &footprints,
                scratch: &mut *scratch,
            };

            let _result = core::hint::black_box(analysis.run(context, body));
        });
    });

    group.bench_function("entity_projections", |bencher| {
        run_bencher(
            bencher,
            create_entity_projections,
            |context, [body], scratch| {
                let mut extraction = TraversalExtraction::new_in(&mut *scratch);
                let _: Changed = extraction.run(context, body);
                let traversals = extraction
                    .take_traversals()
                    .expect("expected GraphReadFilter body");
                scratch.reset();

                let mut size_analysis = SizeEstimationAnalysis::new_in(&*scratch);
                size_analysis.run(context, DefIdSlice::from_raw(core::slice::from_ref(&*body)));
                let footprints = size_analysis.finish();
                scratch.reset();

                let bodies = [Some(traversals)];

                let analysis = hashql_mir::pass::execution::ExecutionAnalysis {
                    traversals: DefIdSlice::from_raw(&bodies),
                    footprints: &footprints,
                    scratch: &mut *scratch,
                };

                let _result = core::hint::black_box(analysis.run(context, body));
            },
        );
    });

    group.bench_function("diamond_cfg", |bencher| {
        run_bencher(bencher, create_diamond_cfg, |context, [body], scratch| {
            let mut extraction = TraversalExtraction::new_in(&mut *scratch);
            let _: Changed = extraction.run(context, body);
            let traversals = extraction
                .take_traversals()
                .expect("expected GraphReadFilter body");
            scratch.reset();

            let mut size_analysis = SizeEstimationAnalysis::new_in(&scratch);
            size_analysis.run(context, DefIdSlice::from_raw(core::slice::from_ref(&*body)));
            let footprints = size_analysis.finish();
            scratch.reset();

            let bodies = [Some(traversals)];

            let analysis = hashql_mir::pass::execution::ExecutionAnalysis {
                traversals: DefIdSlice::from_raw(&bodies),
                footprints: &footprints,
                scratch: &mut *scratch,
            };

            let _result = core::hint::black_box(analysis.run(context, body));
        });
    });
}

criterion_group!(benches, execution_analysis);
criterion_main!(benches);
