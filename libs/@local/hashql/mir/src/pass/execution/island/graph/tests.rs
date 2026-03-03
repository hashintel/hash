//! Tests for island dependency graph construction and requirement resolution.
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;
use core::assert_matches;

use hashql_core::{
    graph::DirectedGraph as _, heap::Heap, id::Id as _, symbol::sym,
    r#type::environment::Environment,
};

use crate::{
    body::{Body, basic_block::BasicBlockVec},
    builder::body,
    intern::Interner,
    pass::execution::{
        VertexType,
        island::{
            IslandId, IslandPlacement,
            graph::{IslandEdge, IslandGraph, IslandKind},
        },
        target::TargetId,
        traversal::EntityPath,
    },
};

pub(crate) fn make_targets(assignments: &[TargetId]) -> BasicBlockVec<TargetId, Global> {
    let mut targets = BasicBlockVec::with_capacity_in(assignments.len(), Global);
    for &target in assignments {
        targets.push(target);
    }
    targets
}

pub(crate) fn build_graph(body: &Body<'_>, targets: &[TargetId]) -> IslandGraph<Global> {
    let target_vec = make_targets(targets);
    let islands = IslandPlacement::new().run(body, VertexType::Entity, &target_vec, Global);
    let mut graph = IslandGraph::build_in(body, VertexType::Entity, islands, Global, Global);
    graph.resolve(Global);
    graph
}

/// Single Postgres island accessing properties: no fetch island needed because the island
/// itself is on the origin backend for that path.
#[test]
fn single_island_no_fetch() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;
        @proj props = vertex.properties: ?;

        bb0() {
            val = load props;
            return val;
        }
    });

    let graph = build_graph(&body, &[TargetId::Postgres]);

    assert_eq!(graph.node_count(), 1);
    assert_matches!(graph[IslandId::new(0)].kind(), IslandKind::Exec(_));
    assert_eq!(graph.edge_count(), 0);
}

/// Postgres island followed by Interpreter island that needs properties.
/// Properties originate from Postgres, so the Interpreter island gets a `DataFlow` edge
/// from the Postgres island: no fetch island needed.
#[test]
fn data_edge_from_predecessor() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val1: ?, val2: ?;
        @proj props = vertex.properties: ?;

        bb0() {
            val1 = load props;
            goto bb1();
        },
        bb1() {
            val2 = load props;
            return val2;
        }
    });

    let graph = build_graph(&body, &[TargetId::Postgres, TargetId::Interpreter]);

    // Two exec nodes, no data islands.
    assert_eq!(graph.node_count(), 2);

    let control_flow_count = graph
        .iter_edges()
        .filter(|edge| edge.data == IslandEdge::ControlFlow)
        .count();
    assert_eq!(control_flow_count, 1);

    let data_flow_count = graph
        .iter_edges()
        .filter(|edge| edge.data == IslandEdge::DataFlow)
        .count();
    assert_eq!(data_flow_count, 1);

    // The Postgres island should provide Properties.
    let postgres_island = (0..graph.node_count())
        .map(IslandId::from_usize)
        .find(|&island_id| graph[island_id].target() == TargetId::Postgres)
        .expect("postgres island exists");
    assert!(
        graph[postgres_island]
            .provides()
            .as_entity()
            .expect("entity vertex")
            .contains(EntityPath::Properties)
    );
}

/// Interpreter island needs embedding data but has no Embedding predecessor.
/// A data island for Embedding should be inserted.
#[test]
fn fetch_island_for_unsatisfied_requirement() {
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

    // One exec node plus one data island for Embedding.
    assert_eq!(graph.node_count(), 2);

    let data_island = (0..graph.node_count())
        .map(IslandId::from_usize)
        .find(|&island_id| matches!(graph[island_id].kind(), IslandKind::Data))
        .expect("data island exists");

    assert_eq!(graph[data_island].target(), TargetId::Embedding);
    assert!(
        graph[data_island]
            .provides()
            .as_entity()
            .expect("entity vertex")
            .contains(EntityPath::Vectors)
    );
}

/// Diamond CFG: Postgres branches to Interpreter and Embedding, both merge into a
/// final Postgres island. The Embedding path is only available on one branch, so the
/// final Postgres island needs a data island for embedding data.
#[test]
fn diamond_branch_needs_fetch() {
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

    // bb0=Postgres, bb1=Interpreter, bb2=Embedding, bb3=Postgres
    let graph = build_graph(
        &body,
        &[
            TargetId::Postgres,
            TargetId::Interpreter,
            TargetId::Embedding,
            TargetId::Postgres,
        ],
    );

    // The Embedding island (bb2) only runs on one branch and doesn't dominate bb3,
    // so a data island for Embedding must be inserted.
    let has_embedding_data_island =
        (0..graph.node_count())
            .map(IslandId::from_usize)
            .any(|island_id| {
                matches!(graph[island_id].kind(), IslandKind::Data)
                    && graph[island_id].target() == TargetId::Embedding
            });

    assert!(
        has_embedding_data_island,
        "expected a data island for Embedding"
    );
}

/// Inherits edge: when two same-target islands are in a dominator relationship,
/// the child inherits provided paths from the parent.
#[test]
fn inherits_edge_same_target_dominator() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val1: ?, val2: ?;
        @proj props = vertex.properties: ?;

        bb0() {
            val1 = load props;
            goto bb1();
        },
        bb1() {
            goto bb2();
        },
        bb2() {
            val2 = load props;
            return val2;
        }
    });

    // bb0=Postgres, bb1=Interpreter, bb2=Postgres
    // bb0 dominates bb2 (through bb1). Both are Postgres, so bb2 should inherit from bb0.
    let graph = build_graph(
        &body,
        &[
            TargetId::Postgres,
            TargetId::Interpreter,
            TargetId::Postgres,
        ],
    );

    let inherits_count = graph
        .iter_edges()
        .filter(|edge| edge.data == IslandEdge::Inherits)
        .count();
    assert!(
        inherits_count > 0,
        "expected an Inherits edge between same-target dominating islands"
    );
}
