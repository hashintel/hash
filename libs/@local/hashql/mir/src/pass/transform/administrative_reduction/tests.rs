#![expect(clippy::min_ident_chars, reason = "tests")]

use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::{Heap, Scratch},
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, TypeId, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{AdministrativeReduction, kind::ReductionKind};
use crate::{
    body::Body,
    builder::{BodyBuilder, body, op, scaffold},
    context::MirContext,
    def::{DefId, DefIdSlice},
    intern::Interner,
    pass::{Changed, GlobalTransformPass as _},
    pretty::TextFormat,
};

/// Tests `TrivialThunk` classification for an identity function (returns parameter).
///
/// ```text
/// fn body0(%0: Int) -> Int {
///   bb0:
///     return %0
/// }
/// ```
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
///
/// ```text
/// fn body0() -> (a: Int, b: Int) {
///   bb0:
///     %0 = (a: 1, b: 2)
///     return %0
/// }
/// ```
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
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = apply fn@0
///     return %0
/// }
/// ```
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
///
/// ```text
/// fn body0() -> Boolean {
///   bb0:
///     %0 = 1
///     %1 = %0 == 2
///     return %1
/// }
/// ```
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
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = apply fn@0
///     %1 = %0           // <-- final statement is Load, not Apply
///     return %1
/// }
/// ```
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
            y = load x;
            return y;
        }
    });

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that returning something other than the call result is not a `ForwardingClosure`.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = 1
///     %1 = apply fn@0
///     return %0         // <-- returns %0, not %1 (the call result)
/// }
/// ```
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
            return x;
        }
    });

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that multiple Apply statements block `ForwardingClosure` classification.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = apply fn@0   // <-- first Apply makes prelude non-trivial
///     %1 = apply fn@0 %0
///     return %1
/// }
/// ```
#[test]
fn classify_non_reducible_multi_call() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(0);

    let body = body!(interner, env; fn@1/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = apply def_id;
            y = apply def_id, x;
            return y;
        }
    });

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that self-recursion is blocked (body doesn't inline itself).
///
/// ```text
/// fn body0@0() -> Int {
///   bb0:
///     %0 = apply fn@0  // <-- calls itself
///     return %0
/// }
/// ```
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
            result = apply def_id;
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
    let changed = pass.run(&mut context, DefIdSlice::from_raw_mut(&mut bodies));

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
    let mut text_format = TextFormat {
        writer: Vec::new(),
        indent: 4,
        sources: (),
        types: &mut formatter,
    };

    text_format
        .format(DefIdSlice::from_raw(bodies), &[])
        .expect("should be able to write bodies");

    let mut pass = AdministrativeReduction::new_in(Scratch::new());
    let changed = pass.run(context, DefIdSlice::from_raw_mut(bodies));

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
///
/// Before:
/// ```text
/// fn body0@0(%0: Int) -> Int {   // Identity thunk
///   bb0:
///     return %0
/// }
///
/// fn body1@1() -> Int {   // ForwardingClosure with prelude
///   bb0:
///     %0 = 99
///     %1 = apply fn@0 %0
///     return %1
/// }
///
/// fn body2@2() -> Int {   // Calls body1
///   bb0:
///     %0 = apply fn@1
///     return %0
/// }
/// ```
///
/// After: All calls inlined with prelude statements preserved.
#[test]
fn inline_closure_with_prelude() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body0 = body!(interner, env; fn@0/1 -> Int {
        decl arg: Int;

        bb0() {
            return arg;
        }
    });

    let body1 = body!(interner, env; fn@1/0 -> Int {
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
///
/// Before:
/// ```text
/// fn body0@0(%0: Int) -> Int {   // Takes arg, returns it
///     bb0:
///         %1 = 10
///         %2 = %0
///         return %2
/// }
///
/// fn body1@1() -> Int {
///     bb0:
///         %0 = 5            // caller_local
///         %1 = call fn@0(%0)  // passes caller_local as arg
///         return %1
/// }
/// ```
///
/// After: The param binding `%2 = %0` uses caller's %0, NOT offset.
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
///
/// ```text
/// fn body0@0() -> Int {   // D: TrivialThunk (leaf)
///   bb0:
///     %0 = 1
///     return %0
/// }
///
/// fn body1@1() -> Int {   // B: Calls D
///   bb0:
///     %0 = apply fn@0
///     return %0
/// }
///
/// fn body2@2() -> Int {   // C: Calls D
///   bb0:
///     %0 = apply fn@0
///     return %0
/// }
///
/// fn body3@3() -> Int {   // A: Calls B and C
///   bb0:
///     %0 = apply fn@1
///     %1 = apply fn@2
///     return %0
/// }
/// ```
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
///
/// ```text
/// fn body0@0() -> Int {   // TrivialThunk returning 1
///   bb0:
///     %0 = 1
///     return %0
/// }
///
/// fn body1@1() -> Int {   // TrivialThunk returning 2
///   bb0:
///     %0 = 2
///     return %0
/// }
///
/// fn body2@2() -> Int {   // Calls body0, then body1
///   bb0:
///     %0 = apply fn@0
///     %1 = apply fn@1
///     return %1
/// }
/// ```
///
/// Both calls should be inlined via statement index rewind.
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
///
/// ```text
/// fn body0@0() -> Int {   // TrivialThunk
///   bb0:
///     %0 = 77
///     return %0
/// }
///
/// fn body1@1() -> Int {
///   bb0:
///     %0 = fn@0         // store fn ptr in local
///     %1 = apply %0     // call via local
///     return %1
/// }
/// ```
///
/// The pass tracks that %0 holds fn@0 and resolves the indirect call.
#[test]
fn inline_indirect_via_local() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let fn_ty = TypeBuilder::synthetic(&env).closure([] as [TypeId; 0], int_ty);

    // Body 0: trivial thunk
    let x0 = builder.local("x", int_ty);
    let const_77 = builder.const_int(77);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_77))
        .ret(x0);
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: stores fn ptr in local, then calls it
    let mut builder = BodyBuilder::new(&interner);
    let f = builder.local("f", fn_ty);
    let result = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(f, |rv| rv.load(fn_ptr0))
        .assign_place(result, |rv| rv.call(f))
        .ret(result);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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
///
/// ```text
/// fn body0@0(%0: Int) -> Int {   // Takes captured env, returns it
///   bb0:
///     %1 = %0
///     return %1
/// }
///
/// fn body1@1() -> Int {
///   bb0:
///     %0 = 55                    // captured value
///     %1 = Closure(fn@0, %0)     // create closure
///     %2 = apply %1.0 %1.1       // call via fn ptr projection, pass env projection
///     return %2
/// }
/// ```
#[test]
fn inline_indirect_closure() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let fn_ty = TypeBuilder::synthetic(&env).closure([int_ty], int_ty);
    let closure_ty = TypeBuilder::synthetic(&env).closure([int_ty], int_ty);

    // Body 0: trivial thunk that takes captured env as first arg
    let env_arg = builder.local("env", int_ty);
    let result0 = builder.local("result", int_ty);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result0, |rv| rv.load(env_arg))
        .ret(result0);
    let mut body0 = builder.finish(1, int_ty);
    body0.id = DefId::new(0);

    // Body 1: creates a closure (fn_ptr, env), then calls it via projections
    let mut builder = BodyBuilder::new(&interner);
    let captured = builder.local("captured", int_ty);
    let closure = builder.local("closure", closure_ty);
    let result1 = builder.local("result", int_ty);
    let const_55 = builder.const_int(55);
    let bb1 = builder.reserve_block([]);

    // Create projections: %1.0 (fn ptr) and %1.1 (env)
    let closure_fn_ptr = builder.place(|p| p.from(closure).field(0, fn_ty));
    let closure_env = builder.place(|p| p.from(closure).field(1, int_ty));

    builder
        .build_block(bb1)
        .assign_place(captured, |rv| rv.load(const_55))
        .assign_place(closure, |rv| rv.closure(body0.id, captured))
        .assign_place(result1, |rv| rv.apply(closure_fn_ptr, [closure_env]))
        .ret(result1);

    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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
