//! Tests for island schedule computation.
#![expect(clippy::min_ident_chars)]

use hashql_core::{
    graph::DirectedGraph as _, heap::Heap, symbol::sym, r#type::environment::Environment,
};

use crate::{
    builder::body,
    intern::Interner,
    pass::execution::{
        island::graph::{IslandKind, tests::build_graph},
        target::TargetId,
    },
};

/// Data islands should be at a lower level than their consumers.
#[test]
fn data_island_before_consumer() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;
        @proj enc = vertex.encodings: ?,
              vecs = enc.vectors: ?;

        bb0() {
            val = load vecs;
            return val;
        }
    });

    let graph = build_graph(&body, &[TargetId::Interpreter]);
    let schedule = graph.schedule();
    let entries = schedule.entries();

    assert!(entries.len() >= 2);

    let exec_entry = entries
        .iter()
        .find(|entry| matches!(graph[entry.island].kind(), IslandKind::Exec(_)));
    let data_entry = entries
        .iter()
        .find(|entry| matches!(graph[entry.island].kind(), IslandKind::Data));

    if let (Some(exec_entry), Some(data_entry)) = (exec_entry, data_entry) {
        assert!(
            exec_entry.level > data_entry.level,
            "exec island (level {}) should be after data island (level {})",
            exec_entry.level,
            data_entry.level
        );
    }
}

/// Every island in the graph appears exactly once in the schedule.
#[test]
fn covers_all_nodes() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             val: ?, cond: Bool;
        @proj props = vertex.properties: ?,
              enc = vertex.encodings: ?,
              vecs = enc.vectors: ?;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            val = load props;
            goto bb3();
        },
        bb2() {
            val = load vecs;
            goto bb3();
        },
        bb3() {
            val = load vecs;
            return val;
        }
    });

    let graph = build_graph(
        &body,
        &[
            TargetId::Postgres,
            TargetId::Interpreter,
            TargetId::Embedding,
            TargetId::Postgres,
        ],
    );

    let schedule = graph.schedule();
    assert_eq!(schedule.entries().len(), graph.node_count());
}

/// Two levels: data island at level 0, exec island at level 1.
#[test]
fn level_count_with_data_dependency() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;
        @proj enc = vertex.encodings: ?,
              vecs = enc.vectors: ?;

        bb0() {
            val = load vecs;
            return val;
        }
    });

    let graph = build_graph(&body, &[TargetId::Interpreter]);
    let schedule = graph.schedule();

    assert_eq!(schedule.level_count(), 2);
    assert_eq!(schedule.levels().count(), 2);
}

/// Each level slice contains islands with the same level, and levels are ascending.
#[test]
fn levels_are_contiguous_and_ascending() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             val: ?, cond: Bool;
        @proj props = vertex.properties: ?,
              enc = vertex.encodings: ?,
              vecs = enc.vectors: ?;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            val = load props;
            goto bb3();
        },
        bb2() {
            val = load vecs;
            goto bb3();
        },
        bb3() {
            val = load vecs;
            return val;
        }
    });

    let graph = build_graph(
        &body,
        &[
            TargetId::Postgres,
            TargetId::Interpreter,
            TargetId::Embedding,
            TargetId::Postgres,
        ],
    );

    let schedule = graph.schedule();
    let mut prev_level = None;
    let mut total_entries = 0;

    for level_slice in schedule.levels() {
        assert!(!level_slice.is_empty());

        let expected_level = level_slice[0].level;
        for entry in level_slice {
            assert_eq!(entry.level, expected_level, "mixed levels within a slice");
        }

        if let Some(prev) = prev_level {
            assert!(expected_level > prev, "levels not strictly ascending");
        }
        prev_level = Some(expected_level);
        total_entries += level_slice.len();
    }

    assert_eq!(
        total_entries,
        schedule.len(),
        "levels must cover all entries"
    );
}

/// Data islands appear in an earlier level slice than their exec consumers.
#[test]
fn levels_order_data_before_exec() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;
        @proj enc = vertex.encodings: ?,
              vecs = enc.vectors: ?;

        bb0() {
            val = load vecs;
            return val;
        }
    });

    let graph = build_graph(&body, &[TargetId::Interpreter]);
    let schedule = graph.schedule();

    let level_slices: Vec<_> = schedule.levels().collect();
    assert_eq!(level_slices.len(), 2);

    for entry in level_slices[0] {
        assert_eq!(entry.level, 0);
        assert!(
            matches!(graph[entry.island].kind(), IslandKind::Data),
            "level 0 should contain the data island"
        );
    }

    for entry in level_slices[1] {
        assert_eq!(entry.level, 1);
        assert!(
            matches!(graph[entry.island].kind(), IslandKind::Exec(_)),
            "level 1 should contain the exec island"
        );
    }
}
