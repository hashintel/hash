#![expect(clippy::min_ident_chars, clippy::similar_names, reason = "tests")]

use alloc::alloc::Global;
use core::fmt::Write as _;
use std::path::PathBuf;

use hashql_core::{heap::Heap, id::Id as _, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::SizeEstimationAnalysis;
use crate::{
    body::Body,
    builder::body,
    context::MirContext,
    def::{DefId, DefIdSlice},
    intern::Interner,
    pass::GlobalAnalysisPass as _,
};

#[track_caller]
fn assert_size_estimation<'heap>(
    name: &'static str,
    bodies: &mut [Body<'heap>],
    heap: &'heap Heap,
    interner: &Interner<'heap>,
    env: &Environment<'heap>,
) {
    let bodies = DefIdSlice::from_raw_mut(bodies);

    let mut context = MirContext {
        heap,
        env,
        interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut analysis = SizeEstimationAnalysis::new_in(Global);
    analysis.run(&mut context, bodies);
    let footprints = analysis.finish();

    let mut output = String::new();
    for (id, footprint) in footprints.iter_enumerated() {
        writeln!(output, "fn@{} {footprint}", id.as_usize()).expect("infallible");
    }

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/size-estimation"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();
    assert_snapshot!(name, output);
}

// ============================================================================
// Dynamic dataflow tests
// ============================================================================

/// Constants produce scalar footprints (1 unit, 1 element).
#[test]
fn constants_are_scalar() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    assert_size_estimation(
        "constants_are_scalar",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Binary operations produce scalar results.
#[test]
fn binary_ops_produce_scalar() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, result: Int;

        bb0() {
            a = load 10;
            b = load 20;
            result = bin.+ a b;
            return result;
        }
    });

    assert_size_estimation(
        "binary_ops_produce_scalar",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Unary operations produce scalar results.
#[test]
fn unary_ops_produce_scalar() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, result: Int;

        bb0() {
            x = load 5;
            result = un.neg x;
            return result;
        }
    });

    assert_size_estimation(
        "unary_ops_produce_scalar",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Tuple aggregates sum operand footprints.
#[test]
fn tuple_aggregate_sums_operands() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> (Int, Int) {
        decl a: Int, b: Int, result: (Int, Int);

        bb0() {
            a = load 1;
            b = load 2;
            result = tuple a, b;
            return result;
        }
    });

    assert_size_estimation(
        "tuple_aggregate_sums_operands",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Struct aggregates sum field footprints.
#[test]
fn struct_aggregate_sums_operands() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> (x: Int, y: Int) {
        decl a: Int, b: Int, result: (x: Int, y: Int);

        bb0() {
            a = load 1;
            b = load 2;
            result = struct x: a, y: b;
            return result;
        }
    });

    assert_size_estimation(
        "struct_aggregate_sums_operands",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// External input loads have unbounded size.
#[test]
fn input_load_is_unbounded() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = input.load! "data";
            return x;
        }
    });

    assert_size_estimation(
        "input_load_is_unbounded",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Input existence checks produce scalar (boolean) results.
#[test]
fn input_exists_is_scalar() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Bool {
        decl exists: Bool;

        bb0() {
            exists = input.exists "data";
            return exists;
        }
    });

    assert_size_estimation(
        "input_exists_is_scalar",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Reading a parameter creates an affine dependency.
#[test]
fn parameter_creates_affine_dependency() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, result: Int;

        bb0() {
            x = input.load! "data";
            result = load x;
            return result;
        }
    });

    assert_size_estimation(
        "parameter_creates_affine_dependency",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Diamond CFG joins branches correctly.
#[test]
fn diamond_cfg_joins_branches() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int, result: Int;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(1);
        },
        bb2() {
            goto bb3(2);
        },
        bb3(x) {
            result = load x;
            return result;
        }
    });

    assert_size_estimation(
        "diamond_cfg_joins_branches",
        core::slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

// ============================================================================
// Integration tests: multi-body analysis
// ============================================================================

/// Callee is analyzed before caller (topological order).
#[test]
fn callee_analyzed_before_caller() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let caller_id = DefId::new(1);

    let callee = body!(interner, env; fn@callee_id/0 -> Int {
        decl result: Int;

        bb0() {
            result = load 42;
            return result;
        }
    });

    let caller = body!(interner, env; fn@caller_id/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply callee_id;
            return result;
        }
    });

    let mut bodies = [callee, caller];
    assert_size_estimation(
        "callee_analyzed_before_caller",
        &mut bodies,
        &heap,
        &interner,
        &env,
    );
}

/// Apply substitutes callee's return footprint based on arguments.
#[test]
fn apply_substitutes_callee_coefficients() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let caller_id = DefId::new(1);

    // Callee returns its parameter (identity function)
    let callee = body!(interner, env; fn@callee_id/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    // Caller passes a scalar constant
    let caller = body!(interner, env; fn@caller_id/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply callee_id, 10;
            return result;
        }
    });

    let mut bodies = [callee, caller];
    assert_size_estimation(
        "apply_substitutes_callee_coefficients",
        &mut bodies,
        &heap,
        &interner,
        &env,
    );
}

/// Mutual recursion converges (SCC fixpoint iteration).
#[test]
fn mutual_recursion_converges() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let fn_a_id = DefId::new(0);
    let fn_b_id = DefId::new(1);

    // fn_a calls fn_b
    let fn_a = body!(interner, env; fn@fn_a_id/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply fn_b_id;
            return result;
        }
    });

    // fn_b calls fn_a (mutual recursion)
    let fn_b = body!(interner, env; fn@fn_b_id/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply fn_a_id;
            return result;
        }
    });

    let mut bodies = [fn_a, fn_b];
    assert_size_estimation(
        "mutual_recursion_converges",
        &mut bodies,
        &heap,
        &interner,
        &env,
    );
}
