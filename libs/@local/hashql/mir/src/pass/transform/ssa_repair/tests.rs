use std::path::PathBuf;

use bstr::ByteVec as _;
use hashql_core::{
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use crate::{
    body::Body,
    context::MirContext,
    def::DefIdSlice,
    op,
    pass::{TransformPass as _, transform::ssa_repair::SsaRepair},
    pretty::TextFormat,
    scaffold,
};

#[track_caller]
fn assert_ssa_pass<'heap>(
    name: &'static str,
    body: Body<'heap>,
    mut context: MirContext<'_, 'heap>,
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

    SsaRepair.run(&mut context, &mut bodies[0]);

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/ssa_repair"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

#[test]
fn linear() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_1))
        .goto(bb1, []);

    builder
        .build_block(bb1)
        .assign_local(x, |rv| rv.load(const_2))
        .assign_local(y, |rv| {
            let x = rv.place_local(x);

            rv.binary(x, op![==], x)
        })
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "linear",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn single_def_use() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let const_1 = builder.const_int(1);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_1))
        .assign_local(y, |rv| {
            let x = rv.place_local(x);

            rv.binary(x, op![==], x)
        })
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "single_def_use",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn diamond_both_branches_define() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let cond = builder.local("cond", TypeBuilder::synthetic(&env).boolean());
    let cond = builder.place_local(cond);
    let const_true = builder.const_bool(true);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.load(const_true))
        .if_else(cond, bb1, [], bb2, []);

    builder
        .build_block(bb1)
        .assign_local(x, |rv| rv.load(const_1))
        .goto(bb3, []);

    builder
        .build_block(bb2)
        .assign_local(x, |rv| rv.load(const_2))
        .goto(bb3, []);

    // Use of x here requires a block param after repair
    builder
        .build_block(bb3)
        .assign_place(cond, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "diamond_both_branches_define",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn diamond_one_branch_redefines() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let cond = builder.local("cond", TypeBuilder::synthetic(&env).boolean());
    let cond = builder.place_local(cond);
    let const_true = builder.const_bool(true);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);

    // Define x before branch
    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.load(const_true))
        .assign_local(x, |rv| rv.load(const_1))
        .if_else(cond, bb1, [], bb2, []);

    // Redefine x in one branch only
    builder
        .build_block(bb1)
        .assign_local(x, |rv| rv.load(const_2))
        .goto(bb3, []);

    // No redefinition here - passthrough
    builder.build_block(bb2).goto(bb3, []);

    // bb3 needs param: x0 from bb2, x1 from bb1
    builder
        .build_block(bb3)
        .assign_place(cond, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "diamond_one_branch_redefines",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn simple_loop() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let cond = builder.local("cond", TypeBuilder::synthetic(&env).boolean());
    let cond = builder.place_local(cond);

    let const_true = builder.const_bool(true);
    let const_0 = builder.const_int(0);
    let const_1 = builder.const_int(1);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // loop header
    let bb2 = builder.reserve_block([]); // exit

    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_0))
        .assign_place(cond, |rv| rv.load(const_true))
        .goto(bb1, []);

    // Loop header: use x, redefine x, branch back or exit
    builder
        .build_block(bb1)
        .assign_place(cond, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .assign_local(x, |rv| rv.load(const_1))
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb2).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "simple_loop",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn passthrough_chain() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_1))
        .goto(bb1, []);

    // Passthrough - no def of x
    builder.build_block(bb1).goto(bb2, []);

    // Passthrough - no def of x
    builder.build_block(bb2).goto(bb3, []);

    // USE x first (from bb0 via passthrough), then redefine
    builder
        .build_block(bb3)
        .assign_local(y, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x) // use before def in this block
        })
        .assign_local(x, |rv| rv.load(const_2))
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "passthrough_chain",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn use_before_def_in_block() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_1))
        .goto(bb1, []);

    // Use x (from bb0), then redefine x
    builder
        .build_block(bb1)
        .assign_local(y, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .assign_local(x, |rv| rv.load(const_2))
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "use_before_def_in_block",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn multiple_defs_same_block() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);

    // Three defs of x in the same block
    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_1))
        .assign_local(x, |rv| rv.load(const_2))
        .assign_local(x, |rv| rv.load(const_3))
        .assign_local(y, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "multiple_defs_same_block",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn three_way_merge() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let selector = builder.local("selector", TypeBuilder::synthetic(&env).integer());
    let selector = builder.place_local(selector);
    let const_0 = builder.const_int(0);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);
    let bb4 = builder.reserve_block([]); // merge point

    builder
        .build_block(bb0)
        .assign_place(selector, |rv| rv.load(const_0))
        .switch(selector, |switch| {
            switch.case(0, bb1, []).case(1, bb2, []).otherwise(bb3, [])
        });

    builder
        .build_block(bb1)
        .assign_local(x, |rv| rv.load(const_1))
        .goto(bb4, []);

    builder
        .build_block(bb2)
        .assign_local(x, |rv| rv.load(const_2))
        .goto(bb4, []);

    builder
        .build_block(bb3)
        .assign_local(x, |rv| rv.load(const_3))
        .goto(bb4, []);

    // Three predecessors, each with different def of x
    builder
        .build_block(bb4)
        .assign_local(y, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "three_way_merge",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn nested_loop() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let outer_cond = builder.local("outer_cond", TypeBuilder::synthetic(&env).boolean());
    let outer_cond = builder.place_local(outer_cond);
    let inner_cond = builder.local("inner_cond", TypeBuilder::synthetic(&env).boolean());
    let inner_cond = builder.place_local(inner_cond);
    let const_true = builder.const_bool(true);
    let const_0 = builder.const_int(0);
    let const_1 = builder.const_int(1);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]); // entry
    let bb1 = builder.reserve_block([]); // outer header
    let bb2 = builder.reserve_block([]); // inner header
    let bb3 = builder.reserve_block([]); // outer latch
    let bb4 = builder.reserve_block([]); // exit

    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_0))
        .assign_place(outer_cond, |rv| rv.load(const_true))
        .assign_place(inner_cond, |rv| rv.load(const_true))
        .goto(bb1, []);

    // Outer loop header
    builder.build_block(bb1).goto(bb2, []);

    // Inner loop: use and redefine x
    builder
        .build_block(bb2)
        .assign_place(outer_cond, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .assign_local(x, |rv| rv.load(const_1))
        .if_else(inner_cond, bb2, [], bb3, []);

    // Outer latch
    builder
        .build_block(bb3)
        .if_else(outer_cond, bb1, [], bb4, []);

    builder.build_block(bb4).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "nested_loop",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn multiple_variables_violated() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let z = builder.local("z", TypeBuilder::synthetic(&env).integer());
    let cond = builder.local("cond", TypeBuilder::synthetic(&env).boolean());
    let cond = builder.place_local(cond);
    let const_true = builder.const_bool(true);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.load(const_true))
        .if_else(cond, bb1, [], bb2, []);

    // Both x and y defined here
    builder
        .build_block(bb1)
        .assign_local(x, |rv| rv.load(const_1))
        .assign_local(y, |rv| rv.load(const_1))
        .goto(bb3, []);

    // Both x and y defined here too
    builder
        .build_block(bb2)
        .assign_local(x, |rv| rv.load(const_2))
        .assign_local(y, |rv| rv.load(const_2))
        .goto(bb3, []);

    // Use both x and y - both need block params
    builder
        .build_block(bb3)
        .assign_local(z, |rv| {
            let x = rv.place_local(x);
            let y = rv.place_local(y);

            rv.binary(x, op![==], y)
        })
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "multiple_variables_violated",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn loop_with_conditional_def() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let loop_cond = builder.local("loop_cond", TypeBuilder::synthetic(&env).boolean());
    let loop_cond = builder.place_local(loop_cond);
    let inner_cond = builder.local("inner_cond", TypeBuilder::synthetic(&env).boolean());
    let inner_cond = builder.place_local(inner_cond);
    let const_true = builder.const_bool(true);
    let const_0 = builder.const_int(0);
    let const_1 = builder.const_int(1);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // loop header
    let bb2 = builder.reserve_block([]); // conditional def
    let bb3 = builder.reserve_block([]); // skip def
    let bb4 = builder.reserve_block([]); // loop latch, use x
    let bb5 = builder.reserve_block([]); // exit

    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_0))
        .assign_place(loop_cond, |rv| rv.load(const_true))
        .assign_place(inner_cond, |rv| rv.load(const_true))
        .goto(bb1, []);

    // Loop header
    builder
        .build_block(bb1)
        .if_else(inner_cond, bb2, [], bb3, []);

    // Redefine x on some iterations
    builder
        .build_block(bb2)
        .assign_local(x, |rv| rv.load(const_1))
        .goto(bb4, []);

    // Skip - no redef
    builder.build_block(bb3).goto(bb4, []);

    // Use x, then loop or exit
    builder
        .build_block(bb4)
        .assign_local(y, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .if_else(loop_cond, bb1, [], bb5, []);

    builder.build_block(bb5).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "loop_with_conditional_def",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
#[test]
fn irreducible() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let cond1 = builder.local("cond1", TypeBuilder::synthetic(&env).boolean());
    let cond1 = builder.place_local(cond1);
    let cond2 = builder.local("cond2", TypeBuilder::synthetic(&env).boolean());
    let cond2 = builder.place_local(cond2);
    let const_true = builder.const_bool(true);
    let const_0 = builder.const_int(0);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);

    // Entry: define x, branch into cycle at either point
    builder
        .build_block(bb0)
        .assign_local(x, |rv| rv.load(const_0))
        .assign_place(cond1, |rv| rv.load(const_true))
        .assign_place(cond2, |rv| rv.load(const_true))
        .if_else(cond1, bb1, [], bb2, []);

    // bb1: USE x first (needs value from bb0 or bb2), then define x
    builder
        .build_block(bb1)
        .assign_local(y, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .assign_local(x, |rv| rv.load(const_1))
        .goto(bb2, []);

    // bb2: USE x first (needs value from bb0 or bb1), then define x, loop or exit
    builder
        .build_block(bb2)
        .assign_local(y, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .assign_local(x, |rv| rv.load(const_2))
        .if_else(cond2, bb1, [], bb3, []);

    // bb3: use x
    builder
        .build_block(bb3)
        .assign_local(y, |rv| {
            let x = rv.place_local(x);
            rv.binary(x, op![==], x)
        })
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "irreducible",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

#[test]
fn reassign_rodeo() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let const_0 = builder.const_int(0);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([x]);

    let x = builder.place_local(x);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_0))
        .assign_place(x, |rv| rv.load(x))
        .goto(bb1, [x.into()]);

    builder.build_block(bb1).goto(bb1, [x.into()]);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

    assert_ssa_pass(
        "reassign_rodeo",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
