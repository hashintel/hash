#![expect(clippy::min_ident_chars, clippy::similar_names, reason = "tests")]

use alloc::alloc::Global;
use core::{fmt::Write as _, slice};
use std::path::PathBuf;

use hashql_core::{
    heap::Heap,
    id::Id as _,
    r#type::{TypeBuilder, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::SizeEstimationAnalysis;
use crate::{
    body::Body,
    builder::{BodyBuilder, body},
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
// These tests use intrinsic types (list, unknown) that cannot be statically
// sized, forcing the analysis to use dynamic dataflow.
// ============================================================================

/// Constants produce scalar footprints even with dynamic types.
#[test]
fn constants_are_scalar() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Use Int which is statically sized - constants are always scalar
    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: ?;

        bb0() {
            x = load 42;
            return x;
        }
    });

    assert_size_estimation(
        "constants_are_scalar",
        slice::from_mut(&mut body),
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
        decl a: Int, b: Int, result: ?;

        bb0() {
            a = load 10;
            b = load 20;
            result = bin.+ a b;
            return result;
        }
    });

    assert_size_estimation(
        "binary_ops_produce_scalar",
        slice::from_mut(&mut body),
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
        decl x: Int, result: ?;

        bb0() {
            x = load 5;
            result = un.neg x;
            return result;
        }
    });

    assert_size_estimation(
        "unary_ops_produce_scalar",
        slice::from_mut(&mut body),
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
        decl a: Int, b: Int, result: (Int, ?);

        bb0() {
            a = load 1;
            b = load 2;
            result = tuple a, b;
            return result;
        }
    });

    assert_size_estimation(
        "tuple_aggregate_sums_operands",
        slice::from_mut(&mut body),
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
        decl a: Int, b: Int, result: (x: Int, y: ?);

        bb0() {
            a = load 1;
            b = load 2;
            result = struct x: a, y: b;
            return result;
        }
    });

    assert_size_estimation(
        "struct_aggregate_sums_operands",
        slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

#[test]
fn input_load_is_unbounded() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> ? {
        decl x: ?;

        bb0() {
            x = input.load! "data";
            return x;
        }
    });

    assert_size_estimation(
        "input_load_is_unbounded",
        slice::from_mut(&mut body),
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
        decl exists: ?;

        bb0() {
            exists = input.exists "data";
            return exists;
        }
    });

    assert_size_estimation(
        "input_exists_is_scalar",
        slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Index projection extracts one element from a collection.
/// The element inherits the collection's unit size but has cardinality 1.
#[test]
fn index_projection_extracts_one_element() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);
    let types = TypeBuilder::synthetic(&env);

    let int_ty = types.integer();
    let list_ty = types.list(types.unknown());

    let mut builder = BodyBuilder::new(&interner);

    // Declare locals: xs (list parameter), idx (index), elem (result)
    let xs = builder.local("xs", list_ty);
    let idx = builder.local("idx", int_ty);
    let elem = builder.local("elem", types.unknown());

    // Create index projection: xs[idx]
    let xs_idx = builder.place(|p| p.from(xs).index(idx.local, types.unknown()));

    // Constants
    let const_0 = builder.const_int(0);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(idx, |rv| rv.load(const_0))
        .assign_place(elem, |rv| rv.load(xs_idx))
        .ret(elem);

    let mut body = builder.finish(1, int_ty);
    body.id = DefId::new(0);

    assert_size_estimation(
        "index_projection_extracts_one_element",
        slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Static type projection uses static analysis on the projected type.
/// When accessing a statically-sized field from a tuple containing unknown types,
/// the projected field's size is determined statically.
#[test]
fn static_type_projection_fallback() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Tuple with (Int, ?) - first field is statically sized, second is unknown
    // Accessing .0 should give us the static size of Int (1..=1)
    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, ?), elem: ?;
        @proj tup_0 = tup.0: Int;

        bb0() {
            tup = input.load! "data";
            elem = load tup_0;
            return elem;
        }
    });

    assert_size_estimation(
        "static_type_projection_fallback",
        slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Field projection on dynamic type uses fallback to base local's footprint.
/// Accessing `.1` on `(Int, ?)` where the second field is unknown-typed
/// falls back to copying the base local's footprint.
#[test]
fn dynamic_field_projection_fallback() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> ? {
        decl tup: (Int, ?), elem: ?;
        @proj tup_1 = tup.1: ?;

        bb0() {
            tup = input.load! "data";
            elem = load tup_1;
            return elem;
        }
    });

    assert_size_estimation(
        "dynamic_field_projection_fallback",
        slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Index projection on a non-parameter local inherits units from that local.
/// When indexing into a list stored in a local (not a parameter), the result
/// inherits the local's unit footprint with cardinality 1.
#[test]
fn index_projection_non_parameter_local() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);
    let types = TypeBuilder::synthetic(&env);

    let int_ty = types.integer();
    let list_ty = types.list(types.unknown());

    let mut builder = BodyBuilder::new(&interner);

    // xs is a local (not a parameter) that gets a list from input
    let xs = builder.local("xs", list_ty);
    let idx = builder.local("idx", int_ty);
    let elem = builder.local("elem", types.unknown());

    // Create index projection: xs[idx]
    let xs_idx = builder.place(|p| p.from(xs).index(idx.local, types.unknown()));

    let const_0 = builder.const_int(0);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(xs, |rv| {
            rv.input(
                hashql_hir::node::operation::InputOp::Load { required: true },
                "data",
            )
        })
        .assign_place(idx, |rv| rv.load(const_0))
        .assign_place(elem, |rv| rv.load(xs_idx))
        .ret(elem);

    // 0 params - xs is not a parameter
    let mut body = builder.finish(0, types.unknown());
    body.id = DefId::new(0);

    assert_size_estimation(
        "index_projection_non_parameter_local",
        slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Reading a dynamically-sized parameter creates an affine dependency.
/// The return footprint should depend on parameter 0.
#[test]
fn parameter_creates_affine_dependency() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Function takes a list (dynamically sized) and returns it
    // The return size should be 1*p0 (affine dependency on parameter 0)
    let mut body = body!(interner, env; fn@0/1 -> [List Int] {
        decl x: [List Int], result: [List Int];

        bb0() {
            result = load x;
            return result;
        }
    });

    assert_size_estimation(
        "parameter_creates_affine_dependency",
        slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

/// Diamond CFG joins branches correctly.
/// Both branches contribute to the result via join.
#[test]
fn diamond_cfg_joins_branches() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Use unknown type to force dynamic analysis
    let mut body = body!(interner, env; fn@0/0 -> ? {
        decl cond: Bool, a: (Int, Int), b: Int, x: ?;

        bb0() {
            a = input.load! "a";
            b = input.load! "b";
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(a);
        },
        bb2() {
            goto bb3(b);
        },
        bb3(x) {
            return x;
        }
    });

    assert_size_estimation(
        "diamond_cfg_joins_branches",
        slice::from_mut(&mut body),
        &heap,
        &interner,
        &env,
    );
}

// ============================================================================
// Integration tests: multi-body analysis
// ============================================================================

/// Callee is analyzed before caller (topological order).
/// The caller's return footprint should reflect the callee's constant return.
#[test]
fn callee_analyzed_before_caller() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let caller_id = DefId::new(1);

    // Callee returns a constant - static analysis handles this
    let callee = body!(interner, env; fn@callee_id/0 -> Int {
        decl result: Int;

        bb0() {
            result = load 42;
            return result;
        }
    });

    let caller = body!(interner, env; fn@caller_id/0 -> Int {
        decl result: ?;

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

/// Apply substitutes callee's affine return footprint based on arguments.
/// Callee returns its parameter (identity), caller passes an unknown input.
#[test]
fn apply_substitutes_callee_coefficients() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let caller_id = DefId::new(1);

    // Callee: identity function on list - returns its parameter
    // Return footprint should be affine: 1*p0
    let callee = body!(interner, env; fn@callee_id/1 -> ? {
        decl x: ?;

        bb0() {
            return x;
        }
    });

    // Caller: loads unknown input, passes to callee
    // Result should inherit the unbounded nature of the input
    let caller = body!(interner, env; fn@caller_id/0 -> ? {
        decl input: Int, result: ?;

        bb0() {
            input = input.load! "data";
            result = apply callee_id, input;
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
/// Two functions that call each other should both reach a stable footprint.
/// Each function has a base case that returns the parameter, ensuring data flows.
#[test]
fn mutual_recursion_converges() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let fn_a_id = DefId::new(0);
    let fn_b_id = DefId::new(1);

    // fn_a: base case returns x, recursive case calls fn_b
    let fn_a = body!(interner, env; fn@fn_a_id/1 -> [List Int] {
        decl x: [List Int], cond: Bool, result: [List Int];

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            // Base case: return parameter directly
            goto bb3(x);
        },
        bb2() {
            // Recursive case: call fn_b
            result = apply fn_b_id, x;
            goto bb3(result);
        },
        bb3(result) {
            return result;
        }
    });

    // fn_b: base case returns x, recursive case calls fn_a
    let fn_b = body!(interner, env; fn@fn_b_id/1 -> [List Int] {
        decl x: [List Int], cond: Bool, result: [List Int];

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            // Base case: return parameter directly
            goto bb3(x);
        },
        bb2() {
            // Recursive case: call fn_a
            result = apply fn_a_id, x;
            goto bb3(result);
        },
        bb3(result) {
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

/// Self-recursion converges to a stable footprint.
/// Has a base case that returns the parameter, ensuring data flows.
#[test]
fn self_recursion_converges() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let fn_id = DefId::new(0);

    // Function with base case (return x) and recursive case (call self)
    let func = body!(interner, env; fn@fn_id/1 -> [List Int] {
        decl x: [List Int], cond: Bool, result: [List Int];

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            // Base case: return parameter directly
            goto bb3(x);
        },
        bb2() {
            // Recursive case: call self
            result = apply fn_id, x;
            goto bb3(result);
        },
        bb3(result) {
            return result;
        }
    });

    let mut bodies = [func];
    assert_size_estimation(
        "self_recursion_converges",
        &mut bodies,
        &heap,
        &interner,
        &env,
    );
}
