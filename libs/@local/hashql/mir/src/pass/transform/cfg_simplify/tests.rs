use std::path::PathBuf;

use bstr::ByteVec as _;
use hashql_core::{
    pretty::Formatter,
    span::SpanId,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::CfgSimplify;
use crate::{
    body::Body,
    context::MirContext,
    def::DefIdSlice,
    error::MirDiagnosticCategory,
    op,
    pass::{Pass as _, transform::error::TransformationDiagnosticCategory},
    pretty::TextFormat,
    scaffold,
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

    text_format
        .writer
        .extend(b"\n\n------------------------------------\n\n");

    CfgSimplify::new().run(context, &mut bodies[0]);

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let selector = builder.local("selector", TypeBuilder::synthetic(&env).integer());
    let selector = builder.place_local(selector);
    let const_0 = builder.const_int(0);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(selector, |rv| rv.load(const_0))
        .switch(selector, |switch| {
            // All arms point to the same block
            switch.case(0, bb1, []).case(1, bb1, []).otherwise(bb1, [])
        });

    builder.build_block(bb1).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let selector = builder.local("selector", TypeBuilder::synthetic(&env).integer());
    let selector = builder.place_local(selector);
    let const_0 = builder.const_int(0);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(selector, |rv| rv.load(const_0))
        .switch(selector, |switch| {
            // No explicit cases, just otherwise
            switch.otherwise(bb1, [])
        });

    builder.build_block(bb1).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let selector = builder.local("selector", TypeBuilder::synthetic(&env).integer());
    let selector = builder.place_local(selector);
    let const_0 = builder.const_int(0);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(selector, |rv| rv.load(const_0))
        .switch(selector, |switch| {
            // Cases 1 and 2 are redundant with otherwise
            switch
                .case(0, bb1, [])
                .case(1, bb2, [])
                .case(2, bb2, [])
                .otherwise(bb2, [])
        });

    builder.build_block(bb1).ret(const_unit);
    builder.build_block(bb2).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
#[expect(clippy::min_ident_chars)]
fn no_inline_non_noop_multiple_preds() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let x_place = builder.place_local(x);
    let a = builder.local("a", TypeBuilder::synthetic(&env).integer());
    let b = builder.local("b", TypeBuilder::synthetic(&env).integer());
    let c = builder.local("c", TypeBuilder::synthetic(&env).integer());
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]); // has statements and multiple predecessors

    // Use x (a runtime variable) as discriminant so switch isn't constant-folded
    builder
        .build_block(bb0)
        .switch(x_place, |switch| switch.case(0, bb1, []).case(1, bb2, []));

    // bb1 and bb2 have statements - they're not noop, so switch can't promote through them
    builder
        .build_block(bb1)
        .assign_local(a, |rv| rv.load(const_1))
        .goto(bb3, []);

    builder
        .build_block(bb2)
        .assign_local(b, |rv| rv.load(const_2))
        .goto(bb3, []);

    // bb3 has actual statements and multiple predecessors - cannot be inlined
    builder
        .build_block(bb3)
        .assign_local(c, |rv| rv.load(const_3))
        .ret(const_unit);

    let body = builder.finish(1, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);

    builder.build_block(bb0).goto(bb1, []);

    // Self-loop: bb1 jumps to itself
    builder.build_block(bb1).goto(bb1, []);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let param = builder.local("p", TypeBuilder::synthetic(&env).integer());
    let const_0 = builder.const_int(0);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([param]);

    builder.build_block(bb0).goto(bb1, [const_0]);

    // Self-loop: bb1 is a noop block that jumps to itself passing its param
    let param_place = builder.place_local(param);
    builder.build_block(bb1).goto(bb1, [param_place.into()]);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let cond = builder.local("cond", TypeBuilder::synthetic(&env).boolean());
    let cond = builder.place_local(cond);
    let const_true = builder.const_bool(true);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]); // noop block with multiple predecessors
    let bb4 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.load(const_true))
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, []);
    builder.build_block(bb2).goto(bb3, []);

    // bb3 is a noop block - contains no statements, just forwards to bb4
    builder.build_block(bb3).goto(bb4, []);

    builder.build_block(bb4).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let selector = builder.local("selector", TypeBuilder::synthetic(&env).integer());
    let selector = builder.place_local(selector);
    let const_0 = builder.const_int(0);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // noop, forwards to bb4
    let bb2 = builder.reserve_block([]); // noop, forwards to bb4
    let bb3 = builder.reserve_block([]); // otherwise
    let bb4 = builder.reserve_block([]); // final target

    builder
        .build_block(bb0)
        .assign_place(selector, |rv| rv.load(const_0))
        .switch(selector, |switch| {
            switch.case(0, bb1, []).case(1, bb2, []).otherwise(bb3, [])
        });

    // bb1 and bb2 are noop blocks that just forward to bb4
    builder.build_block(bb1).goto(bb4, []);
    builder.build_block(bb2).goto(bb4, []);
    builder.build_block(bb3).ret(const_unit);
    builder.build_block(bb4).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let selector = builder.local("selector", TypeBuilder::synthetic(&env).integer());
    let selector = builder.place_local(selector);
    let const_0 = builder.const_int(0);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(selector, |rv| rv.load(const_0))
        .goto(bb1, []);

    // Self-loop: case 0 jumps back to bb1
    builder.build_block(bb1).switch(selector, |switch| {
        switch.case(0, bb1, []).otherwise(bb2, [])
    });

    builder.build_block(bb2).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let const_5 = builder.const_int(5);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);

    // Constant discriminant 5 with no matching case and no otherwise
    builder
        .build_block(bb0)
        .switch(const_5, |switch| switch.case(0, bb1, []).case(1, bb2, []));

    builder.build_block(bb1).ret(const_unit);
    builder.build_block(bb2).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
    scaffold!(heap, interner, builder);
    let env = Environment::new(SpanId::SYNTHETIC, &heap);

    let selector = builder.local("selector", TypeBuilder::synthetic(&env).integer());
    let selector_place = builder.place_local(selector);
    let result = builder.local("result", TypeBuilder::synthetic(&env).integer());
    let param = builder.local("p", TypeBuilder::synthetic(&env).integer());
    let const_0 = builder.const_int(0);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // noop with goto that passes args
    let bb2 = builder.reserve_block([]); // noop with goto that passes args
    let bb3 = builder.reserve_block([]); // otherwise
    let bb4 = builder.reserve_block([param]); // has block parameter

    builder
        .build_block(bb0)
        .assign_place(selector_place, |rv| rv.load(const_0))
        .switch(selector_place, |switch| {
            switch.case(0, bb1, []).case(1, bb2, []).otherwise(bb3, [])
        });

    // bb1 and bb2 are noop blocks but pass arguments - cannot be promoted
    builder.build_block(bb1).goto(bb4, [const_1]);
    builder.build_block(bb2).goto(bb4, [const_2]);
    builder.build_block(bb3).ret(const_unit);

    // bb4 has a block parameter and uses it
    let param_place = builder.place_local(param);
    builder
        .build_block(bb4)
        .assign_local(result, |rv| rv.binary(param_place, op![==], param_place))
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
