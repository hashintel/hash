//! Tests for island placement.
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;

use hashql_core::{heap::Heap, r#type::environment::Environment};

use crate::{
    body::basic_block::{BasicBlockId, BasicBlockVec},
    builder::body,
    intern::Interner,
    pass::execution::{
        island::{IslandId, IslandPlacement},
        target::TargetId,
    },
};

fn make_targets<'heap>(
    heap: &'heap Heap,
    assignments: &[TargetId],
) -> BasicBlockVec<TargetId, &'heap Heap> {
    let mut targets = BasicBlockVec::with_capacity_in(assignments.len(), heap);
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

    let targets = make_targets(&heap, &[TargetId::Interpreter]);
    let islands = IslandPlacement::new().run(&body, &targets, Global);

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

    let targets = make_targets(&heap, &[TargetId::Postgres, TargetId::Postgres]);
    let islands = IslandPlacement::new().run(&body, &targets, Global);

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

    let targets = make_targets(&heap, &[TargetId::Interpreter, TargetId::Postgres]);
    let islands = IslandPlacement::new().run(&body, &targets, Global);

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

    let targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
        ],
    );
    let islands = IslandPlacement::new().run(&body, &targets, Global);

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
    let targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Postgres,
            TargetId::Embedding,
            TargetId::Interpreter,
        ],
    );
    let islands = IslandPlacement::new().run(&body, &targets, Global);

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

    let targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Postgres,
            TargetId::Interpreter,
            TargetId::Postgres,
        ],
    );
    let islands = IslandPlacement::new().run(&body, &targets, Global);

    assert_eq!(islands.len(), 4);
    for island_id in islands.ids() {
        let island = &islands[island_id];
        let block = island.iter().next().expect("island is non-empty");
        assert_eq!(island.target(), targets[block]);
    }
}

/// `Island::is_empty` is false for any island produced by the pass.
#[test]
fn island_is_never_empty() {
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

    let targets = make_targets(&heap, &[TargetId::Interpreter]);
    let islands = IslandPlacement::new().run(&body, &targets, Global);

    for island_id in islands.ids() {
        assert!(!islands[island_id].is_empty());
    }
}

/// `Island::iter` yields exactly the blocks reported by `contains`.
#[test]
fn iter_matches_contains() {
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

    let targets = make_targets(&heap, &[TargetId::Interpreter, TargetId::Postgres]);
    let islands = IslandPlacement::new().run(&body, &targets, Global);

    for island_id in islands.ids() {
        let island = &islands[island_id];
        let members: Vec<_> = island.iter().collect();
        assert_eq!(members.len(), island.count());

        for &block in &members {
            assert!(island.contains(block));
        }
    }
}
