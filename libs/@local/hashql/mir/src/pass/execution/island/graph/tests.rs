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
    IslandGraph::new_in(body, VertexType::Entity, islands, Global, Global)
}

fn find_island(graph: &IslandGraph<Global>, target: TargetId) -> IslandId {
    (0..graph.node_count())
        .map(IslandId::from_usize)
        .find(|&island_id| graph[island_id].target() == target)
        .unwrap_or_else(|| panic!("no island with target {target:?}"))
}

fn find_data_island(graph: &IslandGraph<Global>, target: TargetId) -> IslandId {
    (0..graph.node_count())
        .map(IslandId::from_usize)
        .find(|&island_id| {
            matches!(graph[island_id].kind(), IslandKind::Data)
                && graph[island_id].target() == target
        })
        .unwrap_or_else(|| panic!("no data island with target {target:?}"))
}

fn has_edge(
    graph: &IslandGraph<Global>,
    source: IslandId,
    target: IslandId,
    kind: IslandEdge,
) -> bool {
    graph.iter_edges().any(|edge| {
        edge.source().as_u32() == source.as_u32()
            && edge.target().as_u32() == target.as_u32()
            && edge.data == kind
    })
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
    let island = &graph[IslandId::new(0)];

    assert_eq!(graph.node_count(), 1);
    assert_eq!(graph.edge_count(), 0);
    assert_matches!(island.kind(), IslandKind::Exec(_));
    assert_eq!(island.target(), TargetId::Postgres);

    // Properties are locally available on Postgres (origin), so provides is empty.
    assert!(
        island
            .provides()
            .as_entity()
            .expect("entity vertex")
            .is_empty()
    );
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

    assert_eq!(graph.node_count(), 2);

    let postgres = find_island(&graph, TargetId::Postgres);
    let interpreter = find_island(&graph, TargetId::Interpreter);

    assert_matches!(graph[postgres].kind(), IslandKind::Exec(_));
    assert_matches!(graph[interpreter].kind(), IslandKind::Exec(_));

    // Postgres self-provides exactly Properties (it's the origin).
    let provides = graph[postgres].provides();
    let provides = provides.as_entity().expect("entity vertex");
    assert_eq!(provides.len(), 1);
    assert!(provides.contains(EntityPath::Properties));

    // ControlFlow edge: Postgres → Interpreter (CFG successor).
    assert!(has_edge(
        &graph,
        postgres,
        interpreter,
        IslandEdge::ControlFlow
    ));

    // DataFlow edge: Postgres → Interpreter (Postgres provides Properties to Interpreter).
    assert!(has_edge(
        &graph,
        postgres,
        interpreter,
        IslandEdge::DataFlow
    ));

    assert_eq!(graph.edge_count(), 2);
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

    assert_eq!(graph.node_count(), 2);

    let exec = find_island(&graph, TargetId::Interpreter);
    let data = find_data_island(&graph, TargetId::Embedding);

    assert_matches!(graph[exec].kind(), IslandKind::Exec(_));
    assert_matches!(graph[data].kind(), IslandKind::Data);

    // DataFlow edge: Embedding data island → Interpreter exec island.
    assert!(has_edge(&graph, data, exec, IslandEdge::DataFlow));

    // Data island provides exactly Vectors.
    let provides = graph[data].provides();
    let provides = provides.as_entity().expect("entity vertex");
    assert_eq!(provides.len(), 1);
    assert!(provides.contains(EntityPath::Vectors));
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

    // 4 exec islands + 1 data island for Embedding.
    assert_eq!(graph.node_count(), 5);

    let data = find_data_island(&graph, TargetId::Embedding);
    assert_matches!(graph[data].kind(), IslandKind::Data);

    // The data island provides exactly Vectors.
    let provides = graph[data].provides();
    let provides = provides.as_entity().expect("entity vertex");
    assert_eq!(provides.len(), 1);
    assert!(provides.contains(EntityPath::Vectors));

    // bb3 (second Postgres island) consumes Vectors from the data island.
    // Find both Postgres exec islands: bb0 is the entry, bb3 is the merge point.
    let postgres_islands: Vec<_> = (0..graph.node_count())
        .map(IslandId::from_usize)
        .filter(|&island_id| {
            graph[island_id].target() == TargetId::Postgres
                && matches!(graph[island_id].kind(), IslandKind::Exec(_))
        })
        .collect();
    assert_eq!(postgres_islands.len(), 2);

    // The merge-point Postgres island (bb3) should have a DataFlow edge from the data island.
    let merge_postgres = postgres_islands
        .iter()
        .find(|&&island_id| has_edge(&graph, data, island_id, IslandEdge::DataFlow))
        .expect("data island should have DataFlow edge to a Postgres island");

    // bb3 also inherits from bb0 (both Postgres, bb0 dominates bb3).
    let entry_postgres = postgres_islands
        .iter()
        .find(|&&island_id| island_id != *merge_postgres)
        .expect("two distinct Postgres islands");
    assert!(has_edge(
        &graph,
        *entry_postgres,
        *merge_postgres,
        IslandEdge::Inherits,
    ));
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

    assert_eq!(graph.node_count(), 3);

    // Find the two Postgres exec islands.
    let postgres_islands: Vec<_> = (0..graph.node_count())
        .map(IslandId::from_usize)
        .filter(|&island_id| graph[island_id].target() == TargetId::Postgres)
        .collect();
    assert_eq!(postgres_islands.len(), 2);

    // Determine which is the dominator (bb0) and which is the child (bb2).
    // The Inherits edge points dominator → child.
    let (dominator, child) = if has_edge(
        &graph,
        postgres_islands[0],
        postgres_islands[1],
        IslandEdge::Inherits,
    ) {
        (postgres_islands[0], postgres_islands[1])
    } else {
        assert!(has_edge(
            &graph,
            postgres_islands[1],
            postgres_islands[0],
            IslandEdge::Inherits,
        ));
        (postgres_islands[1], postgres_islands[0])
    };

    // Both islands access Properties locally (origin backend), so neither needs to
    // provide it to anyone. provides is empty on both.
    assert!(
        graph[dominator]
            .provides()
            .as_entity()
            .expect("entity vertex")
            .is_empty()
    );
    assert!(
        graph[child]
            .provides()
            .as_entity()
            .expect("entity vertex")
            .is_empty()
    );
}

/// Two Interpreter islands both need Vectors (origin: Embedding). Only one data island
/// should be created, and both consumers get a `DataFlow` edge from it.
#[test]
fn data_island_reused_across_consumers() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;
        @proj enc = vertex.encodings: ?,
              vecs = enc.vectors: ?;

        bb0() {
            val = load vecs;
            goto bb1();
        },
        bb1() {
            goto bb2();
        },
        bb2() {
            val = load vecs;
            return val;
        }
    });

    // bb0=Interpreter, bb1=Postgres (separates the two Interpreter islands), bb2=Interpreter.
    let graph = build_graph(
        &body,
        &[
            TargetId::Interpreter,
            TargetId::Postgres,
            TargetId::Interpreter,
        ],
    );

    // Two Interpreter exec islands + one Postgres exec island + exactly one data island.
    let data_islands: Vec<_> = (0..graph.node_count())
        .map(IslandId::from_usize)
        .filter(|&island_id| matches!(graph[island_id].kind(), IslandKind::Data))
        .collect();
    assert_eq!(data_islands.len(), 1);

    let data = data_islands[0];
    assert_eq!(graph[data].target(), TargetId::Embedding);

    // Both Interpreter exec islands get a DataFlow edge from the single data island.
    let interpreter_islands: Vec<_> = (0..graph.node_count())
        .map(IslandId::from_usize)
        .filter(|&island_id| {
            matches!(graph[island_id].kind(), IslandKind::Exec(_))
                && graph[island_id].target() == TargetId::Interpreter
        })
        .collect();
    assert_eq!(interpreter_islands.len(), 2);

    for &exec in &interpreter_islands {
        assert!(
            has_edge(&graph, data, exec, IslandEdge::DataFlow),
            "expected DataFlow edge from data island to exec island {exec:?}",
        );
    }
}

/// Entry island on a non-origin backend: the dominator walk reaches the root without
/// finding an origin, so a data island is created.
#[test]
fn entry_island_needs_fetch() {
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

    // Entry island is Interpreter, but Properties origin is Postgres.
    // Dominator walk from the entry hits the root (itself), so no dominator found.
    let graph = build_graph(&body, &[TargetId::Interpreter]);

    assert_eq!(graph.node_count(), 2);

    let exec = find_island(&graph, TargetId::Interpreter);
    let data = find_data_island(&graph, TargetId::Postgres);

    assert!(has_edge(&graph, data, exec, IslandEdge::DataFlow));

    let provides = graph[data].provides();
    let provides = provides.as_entity().expect("entity vertex");
    assert_eq!(provides.len(), 1);
    assert!(provides.contains(EntityPath::Properties));
}

/// Control flow edge dedup: two blocks in the same island both have a successor in
/// another island, but only one `ControlFlow` edge should be created.
#[test]
fn control_flow_edge_dedup() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             val: ?, cond: Bool;

        bb0() {
            cond = load true;
            goto bb1();
        },
        bb1() {
            if cond then bb2() else bb2();
        },
        bb2() {
            val = load true;
            return val;
        }
    });

    // bb0 and bb1 are both Interpreter (same island). bb2 is Postgres.
    // bb1→bb2 appears twice (both arms of the branch), but the BitMatrix dedup
    // ensures only one ControlFlow edge from the Interpreter island to Postgres.
    let graph = build_graph(
        &body,
        &[
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Postgres,
        ],
    );

    assert_eq!(graph.node_count(), 2);
    assert_eq!(graph.edge_count(), 1);

    let interpreter = find_island(&graph, TargetId::Interpreter);
    let postgres = find_island(&graph, TargetId::Postgres);

    assert!(has_edge(
        &graph,
        interpreter,
        postgres,
        IslandEdge::ControlFlow
    ));
}
