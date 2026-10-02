use std::path::PathBuf;

use hashql_core::{
    heap::{Heap, Scratch},
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{Changed, LowerConfig, lower};
use crate::{
    body::Body,
    builder::body,
    context::MirContext,
    def::DefIdVec,
    intern::Interner,
    pretty::{TextFormatAnnotations, TextFormatOptions},
};

struct NoAnnotations;
impl TextFormatAnnotations for NoAnnotations {}

/// Runs the full lowering pipeline on `bodies` and snapshots the resulting MIR.
#[track_caller]
fn assert_lower<'heap>(
    name: &'static str,
    context: &mut MirContext<'_, 'heap>,
    bodies: &mut DefIdVec<Body<'heap>>,
) {
    let mut scratch = Scratch::new();
    let config = LowerConfig::default();

    let status = lower(context, &mut scratch, bodies, &config);
    let _success = status.expect("lowering should not produce critical diagnostics");

    let formatter = Formatter::new(context.heap);
    let type_formatter = TypeFormatter::new(&formatter, context.env, TypeFormatterOptions::terse());

    let mut text_format = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: type_formatter,
        annotations: NoAnnotations,
    }
    .build();

    for (_id, body) in bodies.iter_enumerated() {
        text_format.format_body(body).expect("formatting failed");
    }

    let output = String::from_utf8_lossy(&text_format.writer).into_owned();

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/lower"));
    settings.set_prepend_module_to_snapshot(false);

    let _guard = settings.bind_to_scope();
    assert_snapshot!(name, output);
}

#[test]
fn changed_bitor() {
    for (lhs, rhs, expected) in [
        (Changed::No, Changed::No, Changed::No),
        (Changed::No, Changed::Yes, Changed::Yes),
        (Changed::No, Changed::Unknown, Changed::Unknown),
        (Changed::Yes, Changed::No, Changed::Yes),
        (Changed::Yes, Changed::Yes, Changed::Yes),
        (Changed::Yes, Changed::Unknown, Changed::Yes),
        (Changed::Unknown, Changed::No, Changed::Unknown),
        (Changed::Unknown, Changed::Yes, Changed::Yes),
        (Changed::Unknown, Changed::Unknown, Changed::Unknown),
    ] {
        let result = lhs | rhs;
        assert_eq!(result, expected);
    }
}

/// A body with only an unreachable terminator and no statements.
///
/// Verifies that the optimization pipeline (constant folding, DCE, CFG cleanup,
/// inlining) handles a completely degenerate body without panicking or emitting
/// diagnostics.
#[test]
fn unreachable_only() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> ? {
        decl;

        bb0() {
            unreachable;
        }
    });

    let mut bodies = DefIdVec::new();
    bodies.push(body);

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    assert_lower("unreachable_only", &mut context, &mut bodies);
}

/// A goto into a block whose only terminator is unreachable.
///
/// Tests whether the optimization pipeline propagates the unreachability
/// backward through the goto edge and simplifies the entry block.
#[test]
fn goto_into_unreachable() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> ? {
        decl;

        bb0() {
            goto bb1();
        },
        bb1() {
            unreachable;
        }
    });

    let mut bodies = DefIdVec::new();
    bodies.push(body);

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    assert_lower("goto_into_unreachable", &mut context, &mut bodies);
}
