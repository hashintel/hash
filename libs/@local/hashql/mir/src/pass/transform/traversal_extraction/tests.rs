#![expect(clippy::min_ident_chars, reason = "tests")]

use alloc::alloc::Global;
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
    pass::{TransformPass as _, transform::traversal_extraction::TraversalExtraction},
    pretty::TextFormat,
};

#[track_caller]
fn assert_traversal_pass<'heap>(
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

    let mut pass = TraversalExtraction::new_in(Global);
    let changed = pass.run(&mut context, &mut bodies[0]);

    write!(
        text_format.writer,
        "\n\n{:=^50}\n\n",
        format!(" Changed: {changed:?} ")
    )
    .expect("infallible");

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    // Include traversals info if available
    if let Some(traversals) = pass.take_traversals() {
        write!(text_format.writer, "\n\n{:=^50}\n\n", " Traversals ").expect("infallible");

        for local in bodies[0].local_decls.ids() {
            if let Some(place) = traversals.lookup(local) {
                writeln!(text_format.writer, "{local} → {place}").expect("infallible");
            }
        }
    }

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/traversal_extraction"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

#[test]
fn non_graph_filter_unchanged() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Regular fn body, not GraphReadFilter - should return Changed::No
    let body = body!(interner, env; fn@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), result: Bool;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            result = bin.== vertex_0 42;
            return result;
        }
    });

    assert_traversal_pass(
        "non_graph_filter_unchanged",
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
fn no_projections_from_target() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // GraphReadFilter but no projections from vertex (_1)
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), result: Bool;

        bb0() {
            result = load true;
            return result;
        }
    });

    assert_traversal_pass(
        "no_projections_from_target",
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
fn single_projection_extracted() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Single projection from vertex.0 should be extracted
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), result: Bool;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            result = bin.== vertex_0 42;
            return result;
        }
    });

    assert_traversal_pass(
        "single_projection_extracted",
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
fn nested_projection_extracted() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Nested projection vertex.0.1 should be extracted
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: ((Int, Int), Int), result: Bool;
        @proj vertex_0 = vertex.0: (Int, Int), vertex_0_1 = vertex_0.1: Int;

        bb0() {
            result = bin.== vertex_0_1 42;
            return result;
        }
    });

    assert_traversal_pass(
        "nested_projection_extracted",
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
fn duplicate_same_block_deduped() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Same projection used twice in one block - should reuse extracted local
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), r1: Bool, r2: Bool, result: Bool;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            r1 = bin.== vertex_0 42;
            r2 = bin.== vertex_0 100;
            result = bin.& r1 r2;
            return result;
        }
    });

    assert_traversal_pass(
        "duplicate_same_block_deduped",
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
fn duplicate_different_blocks() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Same projection in different blocks - should create separate locals (no cross-block dedup)
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), r1: Bool, r2: Bool;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            if true then bb1() else bb2();
        },
        bb1() {
            r1 = bin.== vertex_0 42;
            goto bb3(r1);
        },
        bb2() {
            r2 = bin.== vertex_0 100;
            goto bb3(r2);
        },
        bb3(r1) {
            return r1;
        }
    });

    assert_traversal_pass(
        "duplicate_different_blocks",
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
fn multiple_distinct_projections() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Multiple different projections - each gets its own extracted local
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int, Int), r1: Bool, r2: Bool, r3: Bool, result: Bool;
        @proj vertex_0 = vertex.0: Int, vertex_1 = vertex.1: Int, vertex_2 = vertex.2: Int;

        bb0() {
            r1 = bin.== vertex_0 1;
            r2 = bin.== vertex_1 2;
            r3 = bin.== vertex_2 3;
            result = bin.& r1 r2;
            result = bin.& result r3;
            return result;
        }
    });

    assert_traversal_pass(
        "multiple_distinct_projections",
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
fn pre_existing_load_recorded() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Pre-existing load statement should be recorded without generating new statements
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), extracted: Int, result: Bool;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            extracted = load vertex_0;
            result = bin.== extracted 42;
            return result;
        }
    });

    assert_traversal_pass(
        "pre_existing_load_recorded",
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
fn terminator_operand_extraction() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Projection used in terminator should be extracted at block end
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: (Int, Int);
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            return vertex_0;
        }
    });

    assert_traversal_pass(
        "terminator_operand_extraction",
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
fn mixed_statement_and_terminator() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Projections in both statements and terminator
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: (Int, Int), cond: Bool;
        @proj vertex_0 = vertex.0: Int, vertex_1 = vertex.1: Int;

        bb0() {
            cond = bin.== vertex_0 42;
            if cond then bb1() else bb2();
        },
        bb1() {
            return vertex_0;
        },
        bb2() {
            return vertex_1;
        }
    });

    assert_traversal_pass(
        "mixed_statement_and_terminator",
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
fn projection_from_non_target_unchanged() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Projection from env (_0) should not be extracted - only vertex (_1) is target
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int, Int), vertex: (Int, Int), result: Bool;
        @proj env_0 = env.0: Int;

        bb0() {
            result = bin.== env_0 42;
            return result;
        }
    });

    assert_traversal_pass(
        "projection_from_non_target_unchanged",
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
fn traversals_lookup_correct() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Verify traversals.lookup() returns correct projection paths
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int, Int), r1: Bool, r2: Bool, result: Bool;
        @proj vertex_0 = vertex.0: Int, vertex_2 = vertex.2: Int;

        bb0() {
            r1 = bin.== vertex_0 1;
            r2 = bin.== vertex_2 3;
            result = bin.& r1 r2;
            return result;
        }
    });

    assert_traversal_pass(
        "traversals_lookup_correct",
        body,
        MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
