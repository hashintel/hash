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

use crate::{
    body::Body,
    builder::body,
    context::MirContext,
    def::DefIdSlice,
    intern::Interner,
    pass::{TransformPass as _, transform::ssa_repair::SsaRepair},
    pretty::TextFormatOptions,
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
    let mut text_format = TextFormatOptions {
        writer: Vec::new(),
        indent: 4,
        sources: (),
        types: &mut formatter,
    }
    .build();

    let mut bodies = [body];

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let changed = SsaRepair::new().run(&mut context, &mut bodies[0]);
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
    settings.set_snapshot_path(dir.join("tests/ui/pass/ssa_repair"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

#[test]
fn linear() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            x = load 2;
            y = bin.== x x;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = bin.== x x;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 1;
            goto bb3();
        },
        bb2() {
            x = load 2;
            goto bb3();
        },
        bb3() {
            // Use of x here requires a block param after repair
            cond = bin.== x x;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, cond: Bool;

        bb0() {
            // Define x before branch
            cond = load true;
            x = load 1;
            if cond then bb1() else bb2();
        },
        bb1() {
            // Redefine x in one branch only
            x = load 2;
            goto bb3();
        },
        bb2() {
            // No redefinition here - passthrough
            goto bb3();
        },
        bb3() {
            // bb3 needs param: x0 from bb2, x1 from bb1
            cond = bin.== x x;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, cond: Bool;

        bb0() {
            x = load 0;
            cond = load true;
            goto bb1();
        },
        bb1() {
            // Loop header: use x, redefine x, branch back or exit
            cond = bin.== x x;
            x = load 1;
            if cond then bb1() else bb2();
        },
        bb2() {
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            // Passthrough - no def of x
            goto bb2();
        },
        bb2() {
            // Passthrough - no def of x
            goto bb3();
        },
        bb3() {
            // USE x first (from bb0 via passthrough), then redefine
            y = bin.== x x;
            x = load 2;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            // Use x (from bb0), then redefine x
            y = bin.== x x;
            x = load 2;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int;

        bb0() {
            // Three defs of x in the same block
            x = load 1;
            x = load 2;
            x = load 3;
            y = bin.== x x;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int, selector: Int;

        bb0() {
            selector = load 0;
            switch selector [0 => bb1(), 1 => bb2(), _ => bb3()];
        },
        bb1() {
            x = load 1;
            goto bb4();
        },
        bb2() {
            x = load 2;
            goto bb4();
        },
        bb3() {
            x = load 3;
            goto bb4();
        },
        bb4() {
            // Three predecessors, each with different def of x
            y = bin.== x x;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, outer_cond: Bool, inner_cond: Bool;

        bb0() {
            x = load 0;
            outer_cond = load true;
            inner_cond = load true;
            goto bb1();
        },
        bb1() {
            // Outer loop header
            goto bb2();
        },
        bb2() {
            // Inner loop: use and redefine x
            outer_cond = bin.== x x;
            x = load 1;
            if inner_cond then bb2() else bb3();
        },
        bb3() {
            // Outer latch
            if outer_cond then bb1() else bb4();
        },
        bb4() {
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int, z: Int, cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            // Both x and y defined here
            x = load 1;
            y = load 1;
            goto bb3();
        },
        bb2() {
            // Both x and y defined here too
            x = load 2;
            y = load 2;
            goto bb3();
        },
        bb3() {
            // Use both x and y - both need block params
            z = bin.== x y;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int, loop_cond: Bool, inner_cond: Bool;

        bb0() {
            x = load 0;
            loop_cond = load true;
            inner_cond = load true;
            goto bb1();
        },
        bb1() {
            // Loop header
            if inner_cond then bb2() else bb3();
        },
        bb2() {
            // Redefine x on some iterations
            x = load 1;
            goto bb4();
        },
        bb3() {
            // Skip - no redef
            goto bb4();
        },
        bb4() {
            // Use x, then loop or exit
            y = bin.== x x;
            if loop_cond then bb1() else bb5();
        },
        bb5() {
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int, y: Int, cond1: Bool, cond2: Bool;

        bb0() {
            // Entry: define x, branch into cycle at either point
            x = load 0;
            cond1 = load true;
            cond2 = load true;
            if cond1 then bb1() else bb2();
        },
        bb1() {
            // bb1: USE x first (needs value from bb0 or bb2), then define x
            y = bin.== x x;
            x = load 1;
            goto bb2();
        },
        bb2() {
            // bb2: USE x first (needs value from bb0 or bb1), then define x, loop or exit
            y = bin.== x x;
            x = load 2;
            if cond2 then bb1() else bb3();
        },
        bb3() {
            // bb3: use x
            y = bin.== x x;
            return ();
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl x: Int;

        bb0() {
            x = load 0;
            x = load x;
            goto bb1(x);
        },
        bb1(x) {
            goto bb1(x);
        }
    });

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
