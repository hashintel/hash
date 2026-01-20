#![expect(clippy::min_ident_chars, reason = "tests")]

use std::path::PathBuf;

use hashql_core::{heap::Heap, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::DataDependencyAnalysis;
use crate::{
    body::Body, builder::body, context::MirContext, intern::Interner, pass::AnalysisPass as _,
};

#[track_caller]
fn assert_data_dependency<'heap>(
    name: &'static str,
    body: &Body<'heap>,
    context: &mut MirContext<'_, 'heap>,
) {
    let mut analysis = DataDependencyAnalysis::new();
    analysis.run(context, body);
    let graph = analysis.finish();
    let transient = graph.transient(context.interner);

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/data-dependency"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    assert_snapshot!(name, format!("{graph}\n\n=====\n\n{transient}"));
}

/// Tests that a simple load creates a Load edge.
#[test]
fn load_simple() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = input.load! "input";
            y = load x;
            return y;
        }
    });

    assert_data_dependency(
        "load_simple",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that chained loads create a chain of Load edges.
#[test]
fn load_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int;

        bb0() {
            x = input.load! "input";
            y = load x;
            z = load y;
            return z;
        }
    });

    assert_data_dependency(
        "load_chain",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that load with projection creates edge with projection data.
#[test]
fn load_with_projection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), elem: Int;
        @proj tup_0 = tup.0: Int;

        bb0() {
            tup = input.load! "input";
            elem = load tup_0;
            return elem;
        }
    });

    assert_data_dependency(
        "load_with_projection",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that an alias (load) followed by projection resolves through the load.
#[test]
fn load_then_projection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, tup: (Int, Int), alias: (Int, Int), result: Int;
        @proj alias_0 = alias.0: Int;

        bb0() {
            a = input.load! "a";
            b = input.load! "b";
            tup = tuple a, b;
            alias = load tup;
            result = load alias_0;
            return result;
        }
    });

    assert_data_dependency(
        "load_then_projection",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that nested projections resolve correctly through edge projections.
#[test]
fn nested_projection_through_edge() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl input: ((Int, Int), Int), other: Int, wrapped: ((Int, Int), Int), result: Int;
        @proj input_0 = input.0: (Int, Int), wrapped_0 = wrapped.0: (Int, Int), wrapped_0_1 = wrapped_0.1: Int;

        bb0() {
            input = input.load! "input";
            other = input.load! "other";
            wrapped = tuple input_0, other;
            result = load wrapped_0_1;
            return result;
        }
    });

    assert_data_dependency(
        "nested_projection_through_edge",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that Param edges where all predecessors agree resolve correctly.
#[test]
fn param_consensus_agree() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl input: Int, tup: (Int, Int), cond: Int, p1: Int, p2: Int, result: Int;
        @proj tup_0 = tup.0: Int, tup_1 = tup.1: Int;

        bb0() {
            input = input.load! "x";
            tup = tuple input, input;
            cond = input.load! "cond";
            if cond then bb1(tup_0) else bb2(tup_1);
        },
        bb1(p1) {
            goto bb3(p1);
        },
        bb2(p2) {
            goto bb3(p2);
        },
        bb3(result) {
            return result;
        }
    });

    assert_data_dependency(
        "param_consensus_agree",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that Param edges where predecessors diverge do not resolve through.
#[test]
fn param_consensus_diverge() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl input_a: Int, input_b: Int, cond: Int, result: Int;

        bb0() {
            input_a = input.load! "a";
            input_b = input.load! "b";
            cond = input.load! "cond";
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(input_a);
        },
        bb2() {
            goto bb3(input_b);
        },
        bb3(result) {
            return result;
        }
    });

    assert_data_dependency(
        "param_consensus_diverge",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests cycle detection through Param edges.
#[test]
fn param_cycle_detection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl input: Int, x: Int, cond: Int, result: Int;

        bb0() {
            input = input.load! "x";
            cond = input.load! "cond";
            goto bb1(input);
        },
        bb1(x) {
            if cond then bb1(x) else bb2(x);
        },
        bb2(result) {
            return result;
        }
    });

    assert_data_dependency(
        "param_cycle_detection",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant propagation through edges.
#[test]
fn constant_propagation() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl tup: (Int, Int), result: Int;
        @proj tup_0 = tup.0: Int;

        bb0() {
            tup = tuple 42, 100;
            result = load tup_0;
            return result;
        }
    });

    assert_data_dependency(
        "constant_propagation",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests Load edge followed by Param edge resolution through branching.
#[test]
fn load_then_param_consensus() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl input: Int, alias: Int, cond: Int, result: Int;

        bb0() {
            input = input.load! "x";
            alias = load input;
            cond = input.load! "cond";
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(alias);
        },
        bb2() {
            goto bb3(alias);
        },
        bb3(result) {
            return result;
        }
    });

    assert_data_dependency(
        "load_then_param_consensus",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests deeply nested projections after following Load edges.
#[test]
fn load_chain_with_projections() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl input: ((Int, Int), (Int, Int)), alias: ((Int, Int), (Int, Int)), inner: (Int, Int), result: Int;
        @proj alias_0 = alias.0: (Int, Int), inner_1 = inner.1: Int;

        bb0() {
            input = input.load! "input";
            alias = load input;
            inner = load alias_0;
            result = load inner_1;
            return result;
        }
    });

    assert_data_dependency(
        "load_chain_with_projections",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that wrapping a param in a tuple and then projecting back out resolves correctly.
#[test]
fn param_wrap_and_project() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, wrapped: (Int);
        @proj wrapped_0 = wrapped.0: Int;

        bb0(x) {
            wrapped = tuple x;
            goto bb0(wrapped_0);
        }
    });

    assert_data_dependency(
        "param_wrap_and_project",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests resolving through a tuple projection to a constant param where predecessors agree.
#[test]
fn param_const_through_projection_agree() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Int, x: Int, wrapped: (Int), y: Int;
        @proj wrapped_0 = wrapped.0: Int;

        bb0() {
            cond = input.load! "cond";
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(0);
        },
        bb2() {
            goto bb3(0);
        },
        bb3(x) {
            wrapped = tuple x;
            y = load wrapped_0;
            return y;
        }
    });

    assert_data_dependency(
        "param_const_through_projection_agree",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests resolving through a tuple projection to a constant param where predecessors diverge.
#[test]
fn param_const_through_projection_diverge() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Int, x: Int, wrapped: (Int), y: Int;
        @proj wrapped_0 = wrapped.0: Int;

        bb0() {
            cond = input.load! "cond";
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(0);
        },
        bb2() {
            goto bb3(1);
        },
        bb3(x) {
            wrapped = tuple x;
            y = load wrapped_0;
            return y;
        }
    });

    assert_data_dependency(
        "param_const_through_projection_diverge",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests projection prepending when the source is opaque (no edges to traverse).
#[test]
fn projection_prepending_opaque_source() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl input: (((Int, Int), Int), Int), wrapped: ((Int, Int), Int), result: Int;
        @proj input_0 = input.0: ((Int, Int), Int),
              input_0_0 = input_0.0: (Int, Int),
              input_1 = input.1: Int,
              wrapped_0 = wrapped.0: (Int, Int),
              wrapped_0_1 = wrapped_0.1: Int;

        bb0() {
            input = input.load! "input";
            wrapped = tuple input_0_0, input_1;
            result = load wrapped_0_1;
            return result;
        }
    });

    assert_data_dependency(
        "projection_prepending_opaque_source",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
