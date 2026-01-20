#![expect(clippy::similar_names, clippy::min_ident_chars, reason = "tests")]

use std::path::PathBuf;

use hashql_core::{heap::Heap, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{CallGraph, CallGraphAnalysis};
use crate::{
    body::Body, builder::body, context::MirContext, def::DefId, intern::Interner,
    pass::AnalysisPass as _,
};

#[track_caller]
fn assert_callgraph<'heap>(
    name: &'static str,
    bodies: &[Body<'heap>],
    context: &mut MirContext<'_, 'heap>,
) {
    let mut graph = CallGraph::new(crate::def::DefIdSlice::from_raw(bodies));

    for body in bodies {
        let mut analysis = CallGraphAnalysis::new(&mut graph);
        analysis.run(context, body);
    }

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/callgraph"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    assert_snapshot!(name, format!("{graph}"));
}

/// Tests that a direct function application creates an Apply edge.
#[test]
fn direct_apply() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(1);

    let caller = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply callee_id;
            return result;
        }
    });

    let callee = body!(interner, env; fn@callee_id/0 -> Int {
        decl ret: Int;

        bb0() {
            return ret;
        }
    });

    assert_callgraph(
        "direct_apply",
        &[caller, callee],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that function arguments also get visited as Opaque if they contain `DefId`.
#[test]
fn apply_with_fn_argument() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(1);
    let arg_fn_id = DefId::new(2);

    let caller = body!(interner, env; fn@0/0 -> Int {
        decl result: Int;

        bb0() {
            result = apply callee_id, arg_fn_id;
            return result;
        }
    });

    let callee = body!(interner, env; fn@callee_id/0 -> Int {
        decl ret: Int;

        bb0() {
            return ret;
        }
    });

    let arg_body = body!(interner, env; fn@arg_fn_id/0 -> Int {
        decl ret: Int;

        bb0() {
            return ret;
        }
    });

    assert_callgraph(
        "apply_with_fn_argument",
        &[caller, callee, arg_body],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that multiple calls from the same body create multiple edges.
#[test]
fn multiple_calls() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee1_id = DefId::new(1);
    let callee2_id = DefId::new(2);

    let caller = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = apply callee1_id;
            y = apply callee2_id;
            return y;
        }
    });

    let body1 = body!(interner, env; fn@callee1_id/0 -> Int {
        decl ret: Int;

        bb0() {
            return ret;
        }
    });

    let body2 = body!(interner, env; fn@callee2_id/0 -> Int {
        decl ret: Int;

        bb0() {
            return ret;
        }
    });

    assert_callgraph(
        "multiple_calls",
        &[caller, body1, body2],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests call chain across multiple bodies.
#[test]
fn call_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let outer_id = DefId::new(0);
    let middle_id = DefId::new(1);
    let leaf_id = DefId::new(2);

    let outer = body!(interner, env; fn@outer_id/0 -> Int {
        decl x: Int;

        bb0() {
            x = apply middle_id;
            return x;
        }
    });

    let middle = body!(interner, env; fn@middle_id/0 -> Int {
        decl y: Int;

        bb0() {
            y = apply leaf_id;
            return y;
        }
    });

    let leaf = body!(interner, env; fn@leaf_id/0 -> Int {
        decl z: Int;

        bb0() {
            return z;
        }
    });

    assert_callgraph(
        "call_chain",
        &[outer, middle, leaf],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests recursive call (self-reference).
#[test]
fn recursive_call() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let recursive_id = DefId::new(0);

    let body = body!(interner, env; fn@recursive_id/0 -> Int {
        decl x: Int;

        bb0() {
            x = apply recursive_id;
            return x;
        }
    });

    assert_callgraph(
        "recursive_call",
        &[body],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that indirect calls (via local) are tracked as Opaque at assignment, not Apply.
#[test]
fn indirect_call_via_local() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let caller_id = DefId::new(0);
    let callee_id = DefId::new(1);

    let caller = body!(interner, env; fn@caller_id/0 -> Int {
        decl func: [fn(Int) -> Int], result: Int;

        bb0() {
            func = load callee_id;
            result = apply func, 1;
            return result;
        }
    });

    let callee = body!(interner, env; fn@callee_id/1 -> Int {
        decl arg: Int, result: Int;

        bb0() {
            result = load arg;
            return result;
        }
    });

    assert_callgraph(
        "indirect_call_via_local",
        &[caller, callee],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
