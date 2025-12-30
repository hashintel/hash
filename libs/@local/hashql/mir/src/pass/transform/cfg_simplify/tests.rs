#![expect(clippy::min_ident_chars, reason = "tests")]

use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::Heap,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::CfgSimplify;
use crate::{
    body::Body,
    builder::body,
    context::MirContext,
    def::DefIdSlice,
    error::MirDiagnosticCategory,
    intern::Interner,
    pass::{TransformPass as _, transform::error::TransformationDiagnosticCategory},
    pretty::TextFormat,
};

#[track_caller]
fn assert_cfg_simplify_pass<'heap>(
    name: &'static str,
    body: Body<'heap>,
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

    let mut bodies = [body];

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let changed = CfgSimplify::new().run(context, &mut bodies[0]);
    write!(
        text_format.writer,
        "\n\n{:=^50}\n\n",
        format!(" Changed: {changed:?} ")
    )
    .expect("infallible");

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/cfg_simplify"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests that a switch where all arms point to the same block degenerates to a goto.
///
/// Before:
/// ```text
/// bb0: switch_int(x) -> [0: bb1, 1: bb1, otherwise: bb1]
/// bb1: return
/// ```
///
/// After:
/// ```text
/// bb0: goto bb1
/// bb1: return
/// ```
#[test]
fn identical_switch_targets() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl selector: Int;

        bb0() {
            selector = load 0;
            switch selector [0 => bb1(), 1 => bb1(), _ => bb1()];
        },
        bb1() {
            return null;
        }
    });

    assert_cfg_simplify_pass(
        "identical_switch_targets",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that a switch with only an otherwise branch degenerates to a goto.
///
/// Before:
/// ```text
/// bb0: switch_int(x) -> [otherwise: bb1]
/// bb1: return
/// ```
///
/// After:
/// ```text
/// bb0: goto bb1
/// bb1: return
/// ```
#[test]
fn only_otherwise_switch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl selector: Int;

        bb0() {
            selector = load 0;
            switch selector [_ => bb1()];
        },
        bb1() {
            return null;
        }
    });

    assert_cfg_simplify_pass(
        "only_otherwise_switch",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that switch cases matching the otherwise target are removed.
///
/// Before:
/// ```text
/// bb0: switch_int(x) -> [0: bb1, 1: bb2, 2: bb2, otherwise: bb2]
/// bb1: return 1
/// bb2: return 2
/// ```
///
/// After:
/// ```text
/// bb0: switch_int(x) -> [0: bb1, otherwise: bb2]
/// bb1: return 1
/// bb2: return 2
/// ```
#[test]
fn redundant_cases_removal() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl selector: Int;

        bb0() {
            selector = load 0;
            switch selector [0 => bb1(), 1 => bb2(), 2 => bb2(), _ => bb2()];
        },
        bb1() {
            return null;
        },
        bb2() {
            return null;
        }
    });

    assert_cfg_simplify_pass(
        "redundant_cases_removal",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that goto to a non-noop block with multiple predecessors is NOT simplified.
///
/// When a block has multiple predecessors and contains actual statements (not just noop),
/// we cannot inline it because that would duplicate the statements across all paths.
///
/// Before & After (bb3 preserved - has statements and multiple preds):
/// ```text
/// bb0: switch_int(x) -> [0: bb1, 1: bb2]  // runtime value, not constant-folded
/// bb1: a = 1; goto bb3  // non-noop, cannot be promoted through
/// bb2: b = 2; goto bb3  // non-noop, cannot be promoted through
/// bb3: c = 3; return    // has statements, multiple preds - cannot inline
/// ```
#[test]
fn no_inline_non_noop_multiple_preds() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Null {
        decl x: Int, a: Int, b: Int, c: Int;

        bb0() {
            switch x [0 => bb1(), 1 => bb2()];
        },
        bb1() {
            a = load 1;
            goto bb3();
        },
        bb2() {
            b = load 2;
            goto bb3();
        },
        bb3() {
            c = load 3;
            return null;
        }
    });

    assert_cfg_simplify_pass(
        "no_inline_non_noop_multiple_preds",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that goto self-loops are preserved (not simplified).
///
/// A goto that targets its own block cannot be optimized away—it represents
/// an infinite loop that must be preserved in the CFG.
///
/// Before & After:
/// ```text
/// bb0: goto bb1
/// bb1: goto bb1  // self-loop preserved
/// ```
#[test]
fn self_loop_preservation() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            goto bb1();
        },
        bb1() {
            goto bb1();
        }
    });

    assert_cfg_simplify_pass(
        "self_loop_preservation",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that goto self-loops with parameters are preserved.
///
/// A goto that targets its own block with parameters cannot be optimized away—it
/// represents an infinite loop that passes values to each iteration. The block
/// body is empty (noop) but the self-loop must still be preserved.
///
/// Before & After:
/// ```text
/// bb0: goto bb1(0)
/// bb1(p): goto bb1(p)  // noop self-loop with params preserved
/// ```
#[test]
fn self_loop_preservation_with_params() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl p: Int;

        bb0() {
            goto bb1(0);
        },
        bb1(p) {
            goto bb1(p);
        }
    });

    assert_cfg_simplify_pass(
        "self_loop_preservation_with_params",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that goto through a noop block with multiple predecessors is simplified.
///
/// When multiple blocks jump to an empty (noop) block that just forwards to another
/// block, we can redirect each predecessor directly to the final target.
///
/// Before:
/// ```text
/// bb0: if cond -> bb1, bb2
/// bb1: goto bb3  // noop passthrough
/// bb2: goto bb3  // noop passthrough
/// bb3: /* empty */ goto bb4
/// bb4: return
/// ```
///
/// After:
/// ```text
/// bb0: if cond -> bb4, bb4  // direct to return
/// bb1: unreachable
/// bb2: unreachable
/// bb3: unreachable
/// bb4: return
/// ```
#[test]
fn noop_block_multiple_predecessors() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3();
        },
        bb2() {
            goto bb3();
        },
        bb3() {
            goto bb4();
        },
        bb4() {
            return null;
        }
    });

    assert_cfg_simplify_pass(
        "noop_block_multiple_predecessors",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that switch target promotion works through noop blocks.
///
/// When a switch arm targets an empty block with just a goto terminator,
/// we can redirect the switch arm directly to the goto's target.
///
/// Before:
/// ```text
/// bb0: switch_int(x) -> [0: bb1, 1: bb2, otherwise: bb3]
/// bb1: /* noop */ goto bb4
/// bb2: /* noop */ goto bb4
/// bb3: return 3
/// bb4: return 4
/// ```
///
/// After:
/// ```text
/// bb0: switch_int(x) -> [0: bb4, 1: bb4, otherwise: bb3]
/// bb1: unreachable (or preserved if still referenced)
/// bb2: unreachable (or preserved if still referenced)
/// bb3: return 3
/// bb4: return 4
/// ```
#[test]
fn switch_target_promotion() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl selector: Int;

        bb0() {
            selector = load 0;
            switch selector [0 => bb1(), 1 => bb2(), _ => bb3()];
        },
        bb1() {
            goto bb4();
        },
        bb2() {
            goto bb4();
        },
        bb3() {
            return null;
        },
        bb4() {
            return null;
        }
    });

    assert_cfg_simplify_pass(
        "switch_target_promotion",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that switch self-loops are preserved (not simplified).
///
/// A switch arm that targets its own block cannot be optimized away—it represents
/// a loop that must be preserved in the CFG.
///
/// Before & After:
/// ```text
/// bb0: goto bb1
/// bb1: switch_int(x) -> [0: bb1, otherwise: bb2]  // self-loop on case 0
/// bb2: return
/// ```
#[test]
fn switch_self_loop_preservation() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl selector: Int;

        bb0() {
            selector = load 0;
            goto bb1();
        },
        bb1() {
            switch selector [0 => bb1(), _ => bb2()];
        },
        bb2() {
            return null;
        }
    });

    assert_cfg_simplify_pass(
        "switch_self_loop_preservation",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that a constant discriminant with no matching case and no otherwise emits a diagnostic.
///
/// This is an internal compiler error (ICE) case - the discriminant value has no matching
/// case and no fallback otherwise branch. The block becomes unreachable.
///
/// Before:
/// ```text
/// bb0: switch_int(const 5) -> [0: bb1, 1: bb2]  // no case for 5, no otherwise
/// bb1: return 1
/// bb2: return 2
/// ```
///
/// After:
/// ```text
/// bb0: unreachable  // ICE diagnostic emitted
/// bb1: unreachable
/// bb2: unreachable
/// ```
#[test]
fn unreachable_switch_arm_ice() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            switch 5 [0 => bb1(), 1 => bb2()];
        },
        bb1() {
            return null;
        },
        bb2() {
            return null;
        }
    });

    let diagnostics = DiagnosticIssues::new();
    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics,
    };

    assert_cfg_simplify_pass("unreachable_switch_arm_ice", body, &mut context);

    let diagnostics = context.diagnostics.into_vec();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].category,
        MirDiagnosticCategory::Transformation(
            TransformationDiagnosticCategory::UnreachableSwitchArm
        )
    );
}

/// Tests that switch target promotion works through noop blocks that pass arguments.
///
/// When a switch arm targets a noop block whose goto passes arguments, we can
/// promote by copying the goto's target (including args) directly to the switch arm.
///
/// Before:
/// ```text
/// bb0: switch_int(x) -> [0: bb1, 1: bb2, otherwise: bb3]
/// bb1: goto bb4(const 1)
/// bb2: goto bb4(const 2)
/// bb3: return
/// bb4(p): use p; return
/// ```
///
/// After:
/// ```text
/// bb0: switch_int(x) -> [0: bb4(1), 1: bb4(2), otherwise: bb3]
/// bb1: unreachable
/// bb2: unreachable
/// bb3: return
/// bb4(p): use p; return
/// ```
#[test]
fn switch_promotion_with_goto_params() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl selector: Int, result: Int, p: Int;

        bb0() {
            selector = load 0;
            switch selector [0 => bb1(), 1 => bb2(), _ => bb3()];
        },
        bb1() {
            goto bb4(1);
        },
        bb2() {
            goto bb4(2);
        },
        bb3() {
            return null;
        },
        bb4(p) {
            result = bin.== p p;
            return null;
        }
    });

    assert_cfg_simplify_pass(
        "switch_promotion_with_goto_params",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
