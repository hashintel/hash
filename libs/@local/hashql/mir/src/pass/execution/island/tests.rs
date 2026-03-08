//! Tests for island placement.
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;

use hashql_core::{heap::Heap, symbol::sym, r#type::environment::Environment};

use crate::{
    body::basic_block::{BasicBlockId, BasicBlockVec},
    builder::body,
    intern::Interner,
    pass::execution::{
        VertexType,
        island::{IslandId, IslandPlacement},
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

/// Single block — produces exactly one island containing that block.
#[test]
fn single_block() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 1;
            return x;
        }
    });

    let targets = make_targets(&[TargetId::Interpreter]);
    let islands = IslandPlacement::new().run_in(&body, VertexType::Entity, &targets, Global);

    assert_eq!(islands.len(), 1);
    assert_eq!(islands[IslandId::new(0)].target(), TargetId::Interpreter);
    assert_eq!(islands[IslandId::new(0)].count(), 1);
    assert!(islands[IslandId::new(0)].contains(BasicBlockId::new(0)));
}

/// Two blocks with the same target connected by a goto — one island.
#[test]
fn same_target_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            y = load 2;
            return y;
        }
    });

    let targets = make_targets(&[TargetId::Postgres, TargetId::Postgres]);
    let islands = IslandPlacement::new().run_in(&body, VertexType::Entity, &targets, Global);

    assert_eq!(islands.len(), 1);
    assert_eq!(islands[IslandId::new(0)].target(), TargetId::Postgres);
    assert_eq!(islands[IslandId::new(0)].count(), 2);
    assert!(islands[IslandId::new(0)].contains(BasicBlockId::new(0)));
    assert!(islands[IslandId::new(0)].contains(BasicBlockId::new(1)));
}

/// Two blocks with different targets — two islands.
#[test]
fn different_targets() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            y = load 2;
            return y;
        }
    });

    let targets = make_targets(&[TargetId::Interpreter, TargetId::Postgres]);
    let islands = IslandPlacement::new().run_in(&body, VertexType::Entity, &targets, Global);

    assert_eq!(islands.len(), 2);

    // Each island has exactly one block with the correct target.
    assert_eq!(islands[IslandId::new(0)].count(), 1);
    assert_eq!(islands[IslandId::new(1)].count(), 1);

    // One island is Interpreter, the other is Postgres.
    let targets_found: Vec<_> = islands.ids().map(|id| islands[id].target()).collect();
    assert!(targets_found.contains(&TargetId::Interpreter));
    assert!(targets_found.contains(&TargetId::Postgres));

    // They don't overlap.
    let first_has_bb0 = islands[IslandId::new(0)].contains(BasicBlockId::new(0));
    let second_has_bb0 = islands[IslandId::new(1)].contains(BasicBlockId::new(0));
    assert_ne!(first_has_bb0, second_has_bb0);
}

/// Diamond CFG where all blocks share the same target — one island.
#[test]
fn diamond_same_target() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 1;
            goto bb3();
        },
        bb2() {
            y = load 2;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    let targets = make_targets(&[
        TargetId::Interpreter,
        TargetId::Interpreter,
        TargetId::Interpreter,
        TargetId::Interpreter,
    ]);
    let islands = IslandPlacement::new().run_in(&body, VertexType::Entity, &targets, Global);

    assert_eq!(islands.len(), 1);
    assert_eq!(islands[IslandId::new(0)].target(), TargetId::Interpreter);
    assert_eq!(islands[IslandId::new(0)].count(), 4);
}

/// Diamond CFG where each arm has a different target — four islands.
#[test]
fn diamond_mixed_targets() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 1;
            goto bb3();
        },
        bb2() {
            y = load 2;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    // bb0=Interpreter, bb1=Postgres, bb2=Embedding, bb3=Interpreter
    // bb0 and bb3 share a target and are connected (bb1→bb3, bb2→bb3), but neither
    // bb1 nor bb2 has the same target as bb3, so bb0 and bb3 are only connected
    // transitively through different-target blocks. No direct same-target edge between
    // bb0 and bb3, so they must be separate islands.
    let targets = make_targets(&[
        TargetId::Interpreter,
        TargetId::Postgres,
        TargetId::Embedding,
        TargetId::Interpreter,
    ]);
    let islands = IslandPlacement::new().run_in(&body, VertexType::Entity, &targets, Global);

    // bb0 alone, bb1 alone, bb2 alone, bb3 alone — 4 islands, since no same-target
    // edges exist between any pair of connected blocks.
    assert_eq!(islands.len(), 4);
    for island_id in islands.ids() {
        let island = &islands[island_id];
        assert_eq!(island.count(), 1);

        // The island's target must match the target of its sole member.
        let block = island.iter().next().expect("island is non-empty");
        assert_eq!(island.target(), targets[block]);
    }
}

/// Linear chain with alternating targets — each block is its own island.
///
/// Also verifies that same-target blocks separated by a different-target block (bb0 and bb2
/// are both Interpreter but bb1 is Postgres between them) end up in separate islands.
#[test]
fn alternating_targets() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, c: Int, d: Int;

        bb0() {
            a = load 1;
            goto bb1();
        },
        bb1() {
            b = load 2;
            goto bb2();
        },
        bb2() {
            c = load 3;
            goto bb3();
        },
        bb3() {
            d = load 4;
            return d;
        }
    });

    let targets = make_targets(&[
        TargetId::Interpreter,
        TargetId::Postgres,
        TargetId::Interpreter,
        TargetId::Postgres,
    ]);
    let islands = IslandPlacement::new().run_in(&body, VertexType::Entity, &targets, Global);

    assert_eq!(islands.len(), 4);
    for island_id in islands.ids() {
        let island = &islands[island_id];
        assert_eq!(island.count(), 1);

        let block = island.iter().next().expect("island is non-empty");
        assert_eq!(island.target(), targets[block]);
        assert!(island.contains(block));
    }

    // bb0 and bb2 share a target (Interpreter) but must be in different islands
    // because no direct same-target edge connects them.
    let bb0_island = islands
        .ids()
        .find(|&id| islands[id].contains(BasicBlockId::new(0)))
        .expect("bb0 is present");
    let bb2_island = islands
        .ids()
        .find(|&id| islands[id].contains(BasicBlockId::new(2)))
        .expect("bb2 is present");
    assert_ne!(bb0_island, bb2_island);
}

/// Three same-target blocks in a chain — union-find transitively merges into one island.
#[test]
fn transitive_same_target_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, c: Int;

        bb0() {
            a = load 1;
            goto bb1();
        },
        bb1() {
            b = load 2;
            goto bb2();
        },
        bb2() {
            c = load 3;
            return c;
        }
    });

    let targets = make_targets(&[TargetId::Postgres, TargetId::Postgres, TargetId::Postgres]);
    let islands = IslandPlacement::new().run_in(&body, VertexType::Entity, &targets, Global);

    assert_eq!(islands.len(), 1);
    assert_eq!(islands[IslandId::new(0)].count(), 3);
    assert!(islands[IslandId::new(0)].contains(BasicBlockId::new(0)));
    assert!(islands[IslandId::new(0)].contains(BasicBlockId::new(1)));
    assert!(islands[IslandId::new(0)].contains(BasicBlockId::new(2)));
}

/// Island traversals are the join of per-block paths for all blocks in the island.
///
/// Two same-target blocks access different vertex paths (.properties and
/// .metadata.provenance.edition). The island's traversals must contain both.
#[test]
fn island_joins_traversal_paths() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val1: ?, val2: ?;
        @proj props = vertex.properties: ?,
              metadata = vertex.metadata: ?,
              prov = metadata.provenance: ?,
              edition = prov.edition: ?;

        bb0() {
            val1 = load props;
            goto bb1();
        },
        bb1() {
            val2 = load edition;
            return val2;
        }
    });

    let targets = make_targets(&[TargetId::Interpreter, TargetId::Interpreter]);
    let islands = IslandPlacement::new().run_in(&body, VertexType::Entity, &targets, Global);

    assert_eq!(islands.len(), 1);
    let island = &islands[IslandId::new(0)];
    let traversal_paths = island.traversals();
    let joined = traversal_paths.as_entity().expect("entity vertex");
    assert_eq!(joined.len(), 2);
    assert!(joined.contains(EntityPath::Properties));
    assert!(joined.contains(EntityPath::ProvenanceEdition));
}
