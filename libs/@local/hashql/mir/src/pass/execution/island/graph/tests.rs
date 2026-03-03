//! Tests for island dependency graph construction and fetch island insertion.

use alloc::alloc::Global;

use hashql_core::{heap::Heap, symbol::sym, r#type::environment::Environment};

use crate::{
    body::basic_block::{BasicBlockId, BasicBlockVec},
    builder::body,
    intern::Interner,
    pass::execution::{
        VertexType,
        island::{
            IslandId, IslandPlacement,
            graph::{IslandEdgeKind, IslandNode, IslandNodeId, build_island_graph},
        },
        target::TargetId,
        traversal::EntityPath,
    },
};

fn make_targets(assignments: &[TargetId]) -> BasicBlockVec<TargetId, Global> {
    let mut targets = BasicBlockVec::with_capacity_in(assignments.len(), Global);
    for &target in assignments {
        targets.push(target);
    }
    targets
}

/// Single Postgres island accessing properties — no fetch island needed because the island
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

    let targets = make_targets(&[TargetId::Postgres]);
    let islands = IslandPlacement::new().run(&body, VertexType::Entity, &targets, Global);
    let graph = build_island_graph(&body, &islands, VertexType::Entity);

    // One real node, no fetch islands.
    assert_eq!(graph.nodes.len(), 1);
    assert!(
        matches!(graph.nodes[IslandNodeId::new(0)], IslandNode::Real(id) if id == IslandId::new(0))
    );
    assert!(graph.edges.is_empty());
}

/// Postgres island followed by Interpreter island that needs properties.
/// Properties originate from Postgres, so the Interpreter island gets a data edge
/// from the Postgres island — no fetch island needed.
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

    let targets = make_targets(&[TargetId::Postgres, TargetId::Interpreter]);
    let islands = IslandPlacement::new().run(&body, VertexType::Entity, &targets, Global);

    assert_eq!(islands.len(), 2);

    let graph = build_island_graph(&body, &islands, VertexType::Entity);

    // Two real nodes, no fetch islands.
    assert_eq!(graph.nodes.len(), 2);

    // Should have a CFG edge from Postgres to Interpreter.
    let cfg_edges: Vec<_> = graph
        .edges
        .iter()
        .filter(|edge| edge.kind == IslandEdgeKind::Control)
        .collect();
    assert_eq!(cfg_edges.len(), 1);

    // Should have a data edge carrying Properties from Postgres to Interpreter.
    let data_edges: Vec<_> = graph
        .edges
        .iter()
        .filter(|edge| edge.kind == IslandEdgeKind::Data)
        .collect();
    assert_eq!(data_edges.len(), 1);
    assert!(data_edges[0].paths.contains(EntityPath::Properties));
}

/// Interpreter island needs embedding data but has no Embedding predecessor.
/// A FetchIsland(Embedding) should be inserted.
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

    let targets = make_targets(&[TargetId::Interpreter]);
    let islands = IslandPlacement::new().run(&body, VertexType::Entity, &targets, Global);
    let graph = build_island_graph(&body, &islands, VertexType::Entity);

    // One real node plus one FetchIsland(Embedding).
    assert_eq!(graph.nodes.len(), 2);
    assert!(matches!(
        graph.nodes[IslandNodeId::new(0)],
        IslandNode::Real(_)
    ));

    let fetch_node = &graph.nodes[IslandNodeId::new(1)];
    match fetch_node {
        IslandNode::Fetch(fetch) => {
            assert_eq!(fetch.target, TargetId::Embedding);
            assert!(fetch.paths.contains(EntityPath::Vectors));
        }
        IslandNode::Real(_) => panic!("expected FetchIsland, got Real"),
    }
}

/// Diamond CFG: Postgres branches to Interpreter and Embedding, both merge into a
/// final Postgres island. The Embedding path is only available on one branch, so the
/// final Postgres island needs a FetchIsland for embedding data.
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
    let targets = make_targets(&[
        TargetId::Postgres,
        TargetId::Interpreter,
        TargetId::Embedding,
        TargetId::Postgres,
    ]);
    let islands = IslandPlacement::new().run(&body, VertexType::Entity, &targets, Global);
    let graph = build_island_graph(&body, &islands, VertexType::Entity);

    // The final Postgres island needs Vectors. The Embedding island (bb2) only runs on
    // one branch and doesn't dominate bb3, so a FetchIsland(Embedding) must be inserted.
    let fetch_nodes: Vec<_> = graph
        .nodes
        .iter()
        .filter(|node| matches!(node, IslandNode::Fetch(_)))
        .collect();

    assert!(
        !fetch_nodes.is_empty(),
        "expected at least one FetchIsland for embedding data"
    );

    let has_embedding_fetch = fetch_nodes.iter().any(
        |node| matches!(node, IslandNode::Fetch(fetch) if fetch.target == TargetId::Embedding),
    );
    assert!(has_embedding_fetch);
}

/// Schedule levels: independent fetch islands and entry islands should be at level 0.
/// Their consumers should be at level 1 or higher.
#[test]
fn schedule_levels() {
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

    let targets = make_targets(&[TargetId::Interpreter]);
    let islands = IslandPlacement::new().run(&body, VertexType::Entity, &targets, Global);
    let graph = build_island_graph(&body, &islands, VertexType::Entity);

    // The real island depends on the FetchIsland, so it should be at a higher level.
    assert!(graph.schedule.len() >= 2);

    let real_level = graph
        .schedule
        .iter()
        .find(|sched| matches!(graph.nodes[sched.node], IslandNode::Real(_)))
        .map(|sched| sched.level);
    let fetch_level = graph
        .schedule
        .iter()
        .find(|sched| matches!(graph.nodes[sched.node], IslandNode::Fetch(_)))
        .map(|sched| sched.level);

    if let (Some(real_level), Some(fetch_level)) = (real_level, fetch_level) {
        assert!(
            real_level > fetch_level,
            "real island (level {real_level}) should be after fetch island (level {fetch_level})"
        );
    }
}
