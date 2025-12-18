//! Benchmarks for MIR transformation passes.
//!
//! These benchmarks measure the performance of the transformation passes to help identify
//! performance regressions, particularly when comparing different memory allocation strategies
//! (e.g., global allocator vs scratch space).
//!
//! Run with: `cargo bench --package hashql-mir`

extern crate test;

use hashql_core::{
    heap::Scratch,
    r#type::{TypeBuilder, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use test::Bencher;

use super::{CfgSimplify, DeadBlockElimination, DeadStoreElimination, Sroa, SsaRepair};
use crate::{body::Body, context::MirContext, op, pass::TransformPass as _, scaffold};

// =============================================================================
// CfgSimplify benchmarks
// =============================================================================

#[bench]
fn bench_cfg_simplify_linear(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_linear_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = CfgSimplify::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_cfg_simplify_diamond(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_diamond_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = CfgSimplify::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_cfg_simplify_complex(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_complex_cfg_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = CfgSimplify::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

// =============================================================================
// DeadBlockElimination benchmarks
// =============================================================================

#[bench]
fn bench_dbe_linear(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_linear_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = DeadBlockElimination::new_in(Scratch::new());
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_dbe_complex(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_complex_cfg_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = DeadBlockElimination::new_in(Scratch::new());
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

// =============================================================================
// DeadStoreElimination benchmarks
// =============================================================================

#[bench]
fn bench_dse_with_dead_stores(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_dead_store_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = DeadStoreElimination::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_dse_diamond(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_diamond_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = DeadStoreElimination::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_dse_complex(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_complex_cfg_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = DeadStoreElimination::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

// =============================================================================
// SROA benchmarks
// =============================================================================

#[bench]
fn bench_sroa_linear(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_linear_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = Sroa::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_sroa_diamond(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_diamond_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = Sroa::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_sroa_complex(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_complex_cfg_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = Sroa::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

// =============================================================================
// SsaRepair benchmarks
// =============================================================================

#[bench]
fn bench_ssa_repair_linear(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_linear_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = SsaRepair::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_ssa_repair_diamond(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_diamond_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = SsaRepair::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

#[bench]
fn bench_ssa_repair_complex(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_complex_cfg_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut pass = SsaRepair::new();
        pass.run(
            &mut MirContext {
                heap: &heap,
                env: &env,
                interner: &interner,
                diagnostics: DiagnosticIssues::new(),
            },
            &mut body,
        );
        body
    });
}

// =============================================================================
// Combined pipeline benchmarks
// =============================================================================

#[bench]
fn bench_full_pipeline_linear(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_linear_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut context = MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        };

        CfgSimplify::new().run(&mut context, &mut body);
        Sroa::new().run(&mut context, &mut body);
        DeadStoreElimination::new().run(&mut context, &mut body);

        body
    });
}

#[bench]
fn bench_full_pipeline_complex(bencher: &mut Bencher) {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let body = create_complex_cfg_body(&mut builder, &env);

    bencher.iter(|| {
        let mut body = body.clone();
        let mut context = MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        };

        CfgSimplify::new().run(&mut context, &mut body);
        Sroa::new().run(&mut context, &mut body);
        DeadStoreElimination::new().run(&mut context, &mut body);

        body
    });
}
