#![expect(clippy::min_ident_chars, reason = "tests")]

use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::{Heap, Scratch},
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{AdministrativeReduction, kind::ReductionKind};
use crate::{
    body::Body,
    builder::body,
    context::MirContext,
    def::{DefId, DefIdSlice},
    intern::Interner,
    pass::{Changed, GlobalTransformPass as _, GlobalTransformState},
    pretty::TextFormatOptions,
};

/// Tests `TrivialThunk` classification for an identity function (returns parameter).
#[test]
fn classify_thunk_identity() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl arg: Int;

        bb0() {
            return arg;
        }
    });

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests `TrivialThunk` classification for a body with Aggregate.
#[test]
fn classify_thunk_aggregate() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> (a: Int, b: Int) {
        decl x: (a: Int, b: Int);

        bb0() {
            x = struct a: 1, b: 2;
            return x;
        }
    });

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests `ForwardingClosure` classification for a body with single Apply + return.
#[test]
fn classify_closure_immediate() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(0);

    let body = body!(interner, env; fn@1/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply def_id;
            return result;
        }
    });

    assert_eq!(
        ReductionKind::of(&body),
        Some(ReductionKind::ForwardingClosure)
    );
}

/// Tests that a body with multiple basic blocks (control flow) is not reducible.
#[test]
fn classify_non_reducible_multi_bb() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

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
            return x;
        }
    });

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that a body with non-trivial operations (Binary, Unary, etc.) is not reducible.
#[test]
fn classify_non_reducible_non_trivial_op() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Bool;

        bb0() {
            x = load 1;
            y = bin.== x 2;
            return y;
        }
    });

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that Apply not in final statement position is not a `ForwardingClosure`.
#[test]
fn classify_non_reducible_call_not_last() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(0);

    let body = body!(interner, env; fn@1/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = apply (def_id);
            y = load x; // final statement is load, not apply
            return y;
        }
    });

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that returning something other than the call result is not a `ForwardingClosure`.
#[test]
fn classify_non_reducible_return_mismatch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(0);

    let body = body!(interner, env; fn@1/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = apply (def_id);
            return x; // returns x, not y (the call result)
        }
    });

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that multiple Apply statements block `ForwardingClosure` classification.
#[test]
fn classify_non_reducible_multi_call() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(0);

    let body = body!(interner, env; fn@1/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = apply def_id; // First apply makes prelude nontrivial
            y = apply def_id, x;
            return y;
        }
    });

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that self-recursion is blocked (body doesn't inline itself).
///
/// Even though this is classified as `ForwardingClosure`, running the pass should
/// not cause infinite inlining because self-recursion is blocked.
#[test]
fn self_recursion_blocked() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(0);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply def_id; // recursion
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut bodies = [body];
    let mut pass = AdministrativeReduction::new_in(Scratch::new());
    let changed = pass.run(
        &mut context,
        &mut GlobalTransformState::new(DefIdSlice::from_raw_mut(&mut [Changed::No])),
        DefIdSlice::from_raw_mut(&mut bodies),
    );

    assert_eq!(changed, Changed::No);
}

// =============================================================================
// Insta Snapshot Tests
// =============================================================================

#[track_caller]
fn assert_admin_reduction_pass<'heap>(
    name: &'static str,
    bodies: &mut [Body<'heap>],
    context: &mut MirContext<'_, 'heap>,
) {
    let formatter = Formatter::new(context.heap);
    let mut formatter = TypeFormatter::new(
        &formatter,
        context.env,
        TypeFormatterOptions::terse().with_qualified_opaque_names(true),
    );
    let mut text_format = TextFormatOptions {
        writer: Vec::new(),
        indent: 4,
        sources: (),
        types: &mut formatter,
        annotations: (),
    }
    .build();

    text_format
        .format(DefIdSlice::from_raw(bodies), &[])
        .expect("should be able to write bodies");

    let mut pass = AdministrativeReduction::new_in(Scratch::new());
    let changed = pass.run(
        context,
        &mut GlobalTransformState::new_in(DefIdSlice::from_raw(bodies), context.heap),
        DefIdSlice::from_raw_mut(bodies),
    );

    write!(
        text_format.writer,
        "\n\n{:=^50}\n\n",
        format!(" Changed: {changed:?} ")
    )
    .expect("infallible");

    text_format
        .format(DefIdSlice::from_raw(bodies), &[])
        .expect("should be able to write bodies");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/administrative_reduction"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests inlining a simple trivial thunk that returns a constant.
///
/// After: body1 has body0's statements inlined, call replaced with load.
#[test]
fn inline_thunk_simple() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; thunk@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> Int {
        decl x: Int;

        bb0() {
            x = apply (body0.id);
            return x;
        }
    });

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_thunk_simple",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests inlining a thunk with multiple parameters.
#[test]
fn inline_thunk_multi_arg() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; fn@0/3 -> (Int, Int, Int) {
        decl a: Int, b: Int, c: Int, result: (Int, Int, Int);

        bb0() {
            result = tuple a, b, c;
            return result;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> (Int, Int, Int) {
        decl result: (Int, Int, Int);

        bb0() {
            result = apply (body0.id), 1, 2, 3;
            return result;
        }
    });

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_thunk_multi_arg",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests inlining a forwarding closure with a trivial prelude.
#[test]
fn inline_closure_with_prelude() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; fn@0/1 -> Int { // `TrivialThunk` (identity)
        decl arg: Int;

        bb0() {
            return arg;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> Int { // `ForwardingClosure` with prelude
        decl x: Int, result: Int;

        bb0() {
            x = load 99;
            result = apply (body0.id), x;
            return result;
        }
    });

    let body2 = body!(interner, env; fn@2/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply (body1.id);
            return result;
        }
    });

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "inline_closure_with_prelude",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that argument RHS operands are NOT offset (they reference caller locals).
#[test]
fn inline_args_not_offset() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; fn@0/1 -> Int {
        decl arg: Int, local: Int, result: Int;

        bb0() {
            local = load 10;
            result = load arg;
            return result;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> Int {
        decl caller_local: Int, result: Int;

        bb0() {
            caller_local = load 5;
            result = apply (body0.id), caller_local;
            return result;
        }
    });

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_args_not_offset",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests diamond call graph: body3 → {body1, body2} → body0.
#[test]
fn inline_diamond() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 1;
            return x;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply (body0.id);
            return result;
        }
    });

    let body2 = body!(interner, env; fn@2/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply (body0.id);
            return result;
        }
    });

    let body3 = body!(interner, env; fn@3/0 -> Int {
        decl r_b: Int, r_c: Int;

        bb0() {
            r_b = apply (body1.id);
            r_c = apply (body2.id);
            return r_b;
        }
    });

    let mut bodies = [body0, body1, body2, body3];
    assert_admin_reduction_pass(
        "inline_diamond",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that multiple reducible calls in sequence are all inlined.
#[test]
fn inline_sequential_calls() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 1;
            return x;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 2;
            return x;
        }
    });

    let body2 = body!(interner, env; fn@2/0 -> Int {
        decl r0: Int, r1: Int;

        bb0() {
            r0 = apply (body0.id);
            r1 = apply (body1.id);
            return r1;
        }
    });

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "inline_sequential_calls",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests indirect call resolution via local tracking.
#[test]
fn inline_indirect_via_local() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 77;
            return x;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> Int {
        decl f: [fn() -> Int], result: Int;

        bb0() {
            f = load (body0.id);
            result = apply f;
            return result;
        }
    });

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_indirect_via_local",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests closure aggregate tracking: closure `(fn_ptr, env)` is tracked and call is resolved.
#[test]
fn inline_indirect_closure() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; fn@0/1 -> Int {
        decl env_arg: Int, result: Int;

        bb0() {
            result = load env_arg;
            return result;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> Int {
        decl captured: Int, closure: [fn(Int) -> Int], result: Int;
        @proj closure_fn = closure.0: [fn(Int) -> Int], closure_env = closure.1: Int;

        bb0() {
            captured = load 55;
            closure = closure (body0.id) captured;
            result = apply closure_fn, closure_env;
            return result;
        }
    });

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_indirect_closure",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
