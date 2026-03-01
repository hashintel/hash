#![expect(clippy::min_ident_chars, reason = "tests")]

use alloc::alloc::Global;
use core::fmt::{self, Display};
use std::path::PathBuf;

use hashql_core::{
    heap::Heap,
    id::bit_vec::DenseBitSet,
    pretty::Formatter,
    symbol::sym,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use insta::{Settings, assert_snapshot};

use super::{LivenessAnalysis, TraversalLivenessAnalysis};
use crate::{
    body::{Body, basic_block::BasicBlockId, local::Local},
    builder::body,
    intern::Interner,
    pass::{
        analysis::dataflow::framework::{DataflowAnalysis, DataflowResults, Direction},
        execution::{
            VertexType,
            traversal::{EntityPath, TraversalPathBitSet},
        },
    },
    pretty::TextFormatOptions,
};

fn format_liveness_state(mut write: impl fmt::Write, state: &DenseBitSet<Local>) -> fmt::Result {
    for (index, local) in state.iter().enumerate() {
        if index > 0 {
            write!(write, ", ")?;
        }

        write!(write, "{local}")?;
    }

    Ok(())
}

fn format_liveness_result<
    'heap,
    D: DataflowAnalysis<'heap, Domain<Global> = DenseBitSet<Local>>,
>(
    mut write: impl fmt::Write,
    bb: BasicBlockId,
    results: &DataflowResults<'heap, D>,
) -> fmt::Result {
    let entry = &results.entry_states[bb];
    let exit = &results.exit_states[bb];

    write!(write, "{bb}: {{")?;
    format_liveness_state(&mut write, entry)?;
    write!(write, "}} -> {{")?;
    format_liveness_state(&mut write, exit)?;
    write!(write, "}}")?;
    writeln!(write)
}

fn format_liveness<'heap, D: DataflowAnalysis<'heap, Domain<Global> = DenseBitSet<Local>>>(
    body: &Body<'_>,
    results: &DataflowResults<'heap, D>,
) -> impl Display {
    core::fmt::from_fn(|fmt| {
        for bb in body.basic_blocks.ids() {
            format_liveness_result(&mut *fmt, bb, results)?;
        }

        Ok(())
    })
}

fn format_body<'heap>(env: &Environment<'heap>, body: &Body<'heap>) -> impl Display {
    let formatter = Formatter::new(env.heap);
    let mut text_formatter = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: TypeFormatter::new(&formatter, env, TypeFormatterOptions::terse()),
        annotations: (),
    }
    .build();

    text_formatter.format_body(body).expect("infallible");

    String::from_utf8_lossy_owned(text_formatter.writer)
}

#[track_caller]
fn assert_liveness<'heap>(name: &'static str, env: &Environment<'heap>, body: &Body<'heap>) {
    let results = LivenessAnalysis.iterate_to_fixpoint(body);

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/liveness"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    assert_snapshot!(
        name,
        format!(
            "{}\n\n========\n\n{}",
            format_body(env, body),
            format_liveness(body, &results)
        )
    );
}

#[test]
fn direction_is_backward() {
    assert_eq!(LivenessAnalysis::DIRECTION, Direction::Backward);
}

/// Simple straight-line code: `x = 5; return x`.
#[test]
fn use_after_def() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 5;
            return x;
        }
    });

    assert_liveness("use_after_def", &env, &body);
}

/// Dead variable: `x = 5; return 0`.
#[test]
fn dead_variable() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 5;
            return 0;
        }
    });

    assert_liveness("dead_variable", &env, &body);
}

/// Use before def in same block: `y = x; x = 5; return y`.
#[test]
fn use_before_def() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            y = load x;
            x = load 5;
            return y;
        }
    });

    assert_liveness("use_before_def", &env, &body);
}

/// Cross-block liveness: bb0 defines x, bb1 uses x.
#[test]
fn cross_block() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 5;
            goto bb1();
        },
        bb1() {
            return x;
        }
    });

    assert_liveness("cross_block", &env, &body);
}

/// Diamond CFG where variable is used in both branches.
#[test]
fn diamond_both_branches_use() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int, result: Int;

        bb0() {
            x = load 5;
            if x then bb1() else bb2();
        },
        bb1() {
            y = load x;
            goto bb3(y);
        },
        bb2() {
            z = load x;
            goto bb3(z);
        },
        bb3(result) {
            return result;
        }
    });

    assert_liveness("diamond_both_branches_use", &env, &body);
}

/// Block parameters kill liveness.
#[test]
fn block_parameter_kills() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1(5);
        },
        bb1(x) {
            return x;
        }
    });

    assert_liveness("block_parameter_kills", &env, &body);
}

/// Loop: variable used in loop body.
#[test]
fn loop_liveness() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            cond = bin.< x 10;
            x = load x;
            switch cond [1 => bb1(), _ => bb2()];
        },
        bb2() {
            return x;
        }
    });

    assert_liveness("loop_liveness", &env, &body);
}

/// Multiple definitions: only the last one before use matters.
#[test]
fn multiple_definitions() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 1;
            x = load 2;
            x = load 3;
            return x;
        }
    });

    assert_liveness("multiple_definitions", &env, &body);
}

/// Binary operation: both operands should be live.
#[test]
fn binary_op_both_operands_live() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Int, z: Bool;

        bb0() {
            z = bin.== x y;
            return z;
        }
    });

    assert_liveness("binary_op_both_operands_live", &env, &body);
}

/// Only one branch uses variable.
#[test]
fn diamond_one_branch_uses() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 5;
            if x then bb1() else bb2();
        },
        bb1() {
            return x;
        },
        bb2() {
            return 0;
        }
    });

    assert_liveness("diamond_one_branch_uses", &env, &body);
}

// =============================================================================
// TraversalLivenessAnalysis Tests
// =============================================================================

fn traversal_liveness<'a>(body: &'a Body<'a>) -> DataflowResults<'a, TraversalLivenessAnalysis> {
    let analysis = TraversalLivenessAnalysis {
        vertex: VertexType::Entity,
    };
    analysis.iterate_to_fixpoint(body)
}

fn entry_locals<'a>(
    results: &'a DataflowResults<'a, TraversalLivenessAnalysis>,
    block: BasicBlockId,
) -> &'a DenseBitSet<Local> {
    &results.entry_states[block].0
}

fn entry_paths<'a>(
    results: &'a DataflowResults<'a, TraversalLivenessAnalysis>,
    block: BasicBlockId,
) -> &'a TraversalPathBitSet {
    &results.entry_states[block].1
}

/// Vertex local (`_1`) is never marked live in the local bitset.
#[test]
fn vertex_excluded_from_local_bitset() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // _0 = env, _1 = vertex, _2 = props
    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], props: ?;
        @proj properties = vertex.properties: ?;

        bb0() {
            props = load properties;
            goto bb1();
        },
        bb1() {
            return props;
        }
    });

    let results = traversal_liveness(&body);

    // At bb1 entry, _2 (props) is live (used in return), vertex is not
    let bb1_locals = entry_locals(&results, BasicBlockId::new(1));
    assert!(bb1_locals.contains(Local::new(2)));
    assert!(!bb1_locals.contains(Local::VERTEX));

    // At bb0 entry, _2 is killed by its definition, vertex is never live
    let bb0_locals = entry_locals(&results, BasicBlockId::new(0));
    assert!(!bb0_locals.contains(Local::VERTEX));
    assert!(!bb0_locals.contains(Local::new(2)));
}

/// Vertex field accesses are recorded as EntityPaths in the path bitset.
#[test]
fn vertex_access_records_entity_path() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], props: ?;
        @proj properties = vertex.properties: ?;

        bb0() {
            props = load properties;
            return props;
        }
    });

    let results = traversal_liveness(&body);
    let paths = entry_paths(&results, BasicBlockId::new(0));

    let entity_paths = paths.as_entity().expect("should be entity variant");
    assert!(entity_paths.contains(EntityPath::Properties));
}

/// Bare vertex access sets all bits in the path bitset.
#[test]
fn bare_vertex_access_sets_all_paths() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;

        bb0() {
            val = load vertex;
            return val;
        }
    });

    let results = traversal_liveness(&body);
    let paths = entry_paths(&results, BasicBlockId::new(0));

    let entity_paths = paths.as_entity().expect("should be entity variant");
    // 25 variants - 7 children = 18 top-level paths
    assert_eq!(entity_paths.len(), 18);
}

/// Non-vertex locals are tracked normally in the local bitset.
#[test]
fn non_vertex_locals_tracked_normally() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // _0 = env, _1 = vertex, _2 = val, _3 = result
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?], val: Int, result: Int;
        @proj env_0 = env.0: Int;

        bb0() {
            val = load env_0;
            goto bb1();
        },
        bb1() {
            result = load val;
            return result;
        }
    });

    let results = traversal_liveness(&body);

    // At bb1 entry, val (_2) is live (used by the load)
    let bb1_locals = entry_locals(&results, BasicBlockId::new(1));
    assert!(bb1_locals.contains(Local::new(2)));
    assert!(!bb1_locals.contains(Local::VERTEX));

    // Path bitset is empty (no vertex access)
    let bb1_paths = entry_paths(&results, BasicBlockId::new(1));
    assert!(bb1_paths.is_empty());
}

/// Paths from multiple blocks are joined at merge points.
#[test]
fn paths_joined_across_branches() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             props: ?, archived: Bool, cond: Bool;
        @proj properties = vertex.properties: ?,
              metadata = vertex.metadata: ?,
              archived_proj = metadata.archived: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            props = load properties;
            return props;
        },
        bb2() {
            archived = load archived_proj;
            return archived;
        }
    });

    let results = traversal_liveness(&body);
    let paths = entry_paths(&results, BasicBlockId::new(0));

    let entity_paths = paths.as_entity().expect("should be entity variant");
    // Join of {Properties} and {Archived}
    assert!(entity_paths.contains(EntityPath::Properties));
    assert!(entity_paths.contains(EntityPath::Archived));
    assert_eq!(entity_paths.len(), 2);
}
