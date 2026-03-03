//! Tests for island schedule computation.
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;

use hashql_core::{
    graph::DirectedGraph, heap::Heap, symbol::sym, r#type::environment::Environment,
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
    let schedule = graph.schedule(Global);
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

    let schedule = graph.schedule(Global);
    assert_eq!(schedule.entries().len(), graph.node_count());
}
