//! Tests for basic block splitting.
#![expect(clippy::min_ident_chars, clippy::cast_possible_truncation)]
use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    assert_matches,
    fmt::{self, Display},
};
use std::{io::Write as _, path::PathBuf};

use hashql_core::{
    heap::Heap,
    id::bit_vec::FiniteBitSet,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{BasicBlockSplitting, count_regions, offset_basic_blocks, supported_statement};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
        location::Location,
        statement::{Statement, StatementKind},
        terminator::TerminatorKind,
    },
    builder::body,
    context::MirContext,
    intern::Interner,
    pass::execution::{
        cost::{Cost, StatementCostVec, TerminatorCostVec},
        target::{TargetArray, TargetBitSet, TargetId},
    },
    pretty::{TextFormatAnnotations, TextFormatOptions},
};

// =============================================================================
// Test Helpers
// =============================================================================

struct Targets {
    interpreter: bool,
    postgres: bool,
    embedding: bool,
}

impl Targets {
    fn compile(self) -> TargetBitSet {
        let mut bitset = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT as u32);
        if self.interpreter {
            bitset.insert(TargetId::Interpreter);
        }
        if self.postgres {
            bitset.insert(TargetId::Postgres);
        }
        if self.embedding {
            bitset.insert(TargetId::Embedding);
        }
        bitset
    }
}

#[expect(clippy::needless_pass_by_value)]
fn make_target_costs<'heap, const N: usize>(
    body: &Body<'heap>,
    patterns: TargetArray<[impl AsRef<[bool]>; N]>,
    heap: &'heap Heap,
) -> TargetArray<StatementCostVec<&'heap Heap>> {
    let mut costs = TargetArray::from_fn(|_| StatementCostVec::new_in(&body.basic_blocks, heap));

    for (target_id, block_patterns) in patterns.iter_enumerated() {
        for (block_index, stmt_patterns) in block_patterns.iter().enumerate() {
            let block = BasicBlockId::new(block_index as u32);

            for (statement_index, &supported) in stmt_patterns.as_ref().iter().enumerate() {
                if !supported {
                    continue;
                }

                let location = Location {
                    block,
                    statement_index: statement_index + 1,
                };

                costs[target_id][location] = Some(cost!(1));
            }
        }
    }

    costs
}

/// Creates terminator costs where every target supports every block's terminator.
fn make_all_supported_terminator_costs<'heap>(
    body: &Body<'heap>,
    heap: &'heap Heap,
) -> TargetArray<TerminatorCostVec<&'heap Heap>> {
    TargetArray::from_fn(|_| {
        let mut costs = TerminatorCostVec::new_in(&body.basic_blocks, heap);
        for (id, _) in body.basic_blocks.iter_enumerated() {
            costs.insert(id, cost!(1));
        }
        costs
    })
}

/// Creates terminator costs with per-target, per-block support patterns.
///
/// `patterns[target][block]` is `true` if the target supports the terminator of that block.
fn make_terminator_costs<'heap, const N: usize>(
    body: &Body<'heap>,
    patterns: TargetArray<[bool; N]>,
    heap: &'heap Heap,
) -> TargetArray<TerminatorCostVec<&'heap Heap>> {
    let mut costs = TargetArray::from_fn(|_| TerminatorCostVec::new_in(&body.basic_blocks, heap));

    for (target_id, block_patterns) in patterns.iter_enumerated() {
        for (block_index, &supported) in block_patterns.iter().enumerate() {
            if supported {
                let block = BasicBlockId::new(block_index as u32);
                costs[target_id].insert(block, cost!(1));
            }
        }
    }

    costs
}

fn assert_assignment_locals(body: &Body<'_>, block_id: BasicBlockId, expected: &[&str]) {
    let block = &body.basic_blocks[block_id];
    assert_eq!(block.statements.len(), expected.len());

    for (statement, expected_name) in block.statements.iter().zip(expected) {
        let StatementKind::Assign(assign) = &statement.kind else {
            panic!("expected assignment statement");
        };

        let name = body.local_decls[assign.lhs.local]
            .name
            .expect("expected named local");
        assert_eq!(name.as_str(), *expected_name);
    }
}

fn assert_goto_terminator(body: &Body<'_>, block_id: BasicBlockId) {
    let block = &body.basic_blocks[block_id];
    assert_matches!(block.terminator.kind, TerminatorKind::Goto(_));
}

fn assert_goto_target(body: &Body<'_>, block_id: BasicBlockId, target: BasicBlockId) {
    let block = &body.basic_blocks[block_id];
    let TerminatorKind::Goto(goto) = &block.terminator.kind else {
        panic!("expected Goto terminator");
    };
    assert_eq!(goto.target.block, target);
}

fn assert_return_terminator(body: &Body<'_>, block_id: BasicBlockId) {
    let block = &body.basic_blocks[block_id];
    assert_matches!(block.terminator.kind, TerminatorKind::Return(_));
}

// =============================================================================
// supported() Tests
// =============================================================================

#[test]
fn supported_all_targets() {
    let costs: TargetArray<&[Option<Cost>]> =
        TargetArray::from_raw([&[Some(cost!(1))], &[Some(cost!(2))], &[Some(cost!(3))]]);

    let result = supported_statement(&costs, 0);
    let expected = Targets {
        interpreter: true,
        postgres: true,
        embedding: true,
    }
    .compile();

    assert_eq!(result, expected);
}

#[test]
fn supported_no_targets() {
    let costs: TargetArray<&[Option<Cost>]> = TargetArray::from_raw([&[None], &[None], &[None]]);

    let result = supported_statement(&costs, 0);

    assert!(result.is_empty());
}

#[test]
fn supported_single_target() {
    let costs: TargetArray<&[_]> = TargetArray::from_raw([&[Some(cost!(1))], &[None], &[None]]);

    let result = supported_statement(&costs, 0);

    assert!(result.contains(TargetId::Interpreter));
    assert!(!result.contains(TargetId::Postgres));
    assert!(!result.contains(TargetId::Embedding));
}

#[test]
fn supported_mixed_targets() {
    let costs: TargetArray<&[_]> =
        TargetArray::from_raw([&[Some(cost!(1))], &[Some(cost!(2))], &[None]]);

    let result = supported_statement(&costs, 0);
    let expected = Targets {
        interpreter: true,
        postgres: true,
        embedding: false,
    }
    .compile();

    assert_eq!(result, expected);
}

// =============================================================================
// count_regions() Tests
// =============================================================================

#[test]
fn count_regions_empty_block() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    let costs = TargetArray::from_fn(|_| StatementCostVec::new_in(&body.basic_blocks, &heap));
    let terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 1);
}

#[test]
fn count_regions_single_statement() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    let patterns = TargetArray::from_raw([[[true]], [[true]], [[false]]]);
    let costs = make_target_costs(&body, patterns, &heap);
    let terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 1);
}

#[test]
fn count_regions_uniform_support() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int;

        bb0() {
            x = load 1;
            y = load 2;
            z = load 3;
            return z;
        }
    });

    let patterns = TargetArray::from_raw([
        [[true, true, true]],
        [[true, true, true]],
        [[false, false, false]],
    ]);
    let costs = make_target_costs(&body, patterns, &heap);
    let terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 1);
}

#[test]
fn count_regions_two_regions() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let patterns = TargetArray::from_raw([[[true, true]], [[true, false]], [[false, false]]]);
    let costs = make_target_costs(&body, patterns, &heap);
    let terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 2);
}

#[test]
fn count_regions_three_regions() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int;

        bb0() {
            x = load 1;
            y = load 2;
            z = load 3;
            return z;
        }
    });

    let patterns = TargetArray::from_raw([
        [[true, true, true]],
        [[true, false, true]],
        [[false, false, false]],
    ]);
    let costs = make_target_costs(&body, patterns, &heap);
    let terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 3);
}

#[test]
fn count_regions_alternating() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, c: Int, d: Int;

        bb0() {
            a = load 1;
            b = load 2;
            c = load 3;
            d = load 4;
            return d;
        }
    });

    let patterns = TargetArray::from_raw([
        [[true, true, true, true]],
        [[true, false, true, false]],
        [[false, false, false, false]],
    ]);
    let costs = make_target_costs(&body, patterns, &heap);
    let terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 4);
}

// =============================================================================
// offset_basic_blocks() Tests
// =============================================================================

#[test]
fn offset_single_block_no_split() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([[[true]], [[true]], [[false]]]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_eq!(body.basic_blocks.len(), 1);
    assert_eq!(targets.len(), 1);

    assert_assignment_locals(&body, BasicBlockId::new(0), &["x"]);
    assert_return_terminator(&body, BasicBlockId::new(0));

    let expected = Targets {
        interpreter: true,
        postgres: true,
        embedding: false,
    }
    .compile();
    assert_eq!(targets[BasicBlockId::new(0)], expected);
}

#[test]
fn offset_single_block_splits() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([[[true, true]], [[true, false]], [[false, false]]]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_eq!(body.basic_blocks.len(), 2);
    assert_eq!(targets.len(), 2);

    assert_assignment_locals(&body, BasicBlockId::new(0), &["x"]);
    assert_assignment_locals(&body, BasicBlockId::new(1), &["y"]);
    assert_goto_target(&body, BasicBlockId::new(0), BasicBlockId::new(1));
    assert_return_terminator(&body, BasicBlockId::new(1));

    let expected_first = Targets {
        interpreter: true,
        postgres: true,
        embedding: false,
    }
    .compile();
    let expected_second = Targets {
        interpreter: true,
        postgres: false,
        embedding: false,
    }
    .compile();
    assert_eq!(targets[BasicBlockId::new(0)], expected_first);
    assert_eq!(targets[BasicBlockId::new(1)], expected_second);
}

#[test]
fn offset_multiple_blocks_no_splits() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
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

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([[[true], [true]], [[true], [true]], [[false], [false]]]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_eq!(body.basic_blocks.len(), 2);
    assert_eq!(targets.len(), 2);

    assert_assignment_locals(&body, BasicBlockId::new(0), &["x"]);
    assert_assignment_locals(&body, BasicBlockId::new(1), &["y"]);
    assert_goto_target(&body, BasicBlockId::new(0), BasicBlockId::new(1));
    assert_return_terminator(&body, BasicBlockId::new(1));

    let expected = Targets {
        interpreter: true,
        postgres: true,
        embedding: false,
    }
    .compile();
    assert_eq!(targets[BasicBlockId::new(0)], expected);
    assert_eq!(targets[BasicBlockId::new(1)], expected);
}

#[test]
fn offset_multiple_blocks_mixed() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int;

        bb0() {
            x = load 1;
            y = load 2;
            goto bb1();
        },
        bb1() {
            z = load 3;
            return z;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true].as_slice(), [true].as_slice()],
        [&[true, false], &[true]],
        [&[false, false], &[false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_eq!(body.basic_blocks.len(), 3);
    assert_eq!(targets.len(), 3);

    assert_assignment_locals(&body, BasicBlockId::new(0), &["x"]);
    assert_assignment_locals(&body, BasicBlockId::new(1), &["y"]);
    assert_assignment_locals(&body, BasicBlockId::new(2), &["z"]);
    assert_goto_target(&body, BasicBlockId::new(0), BasicBlockId::new(1));
    assert_goto_target(&body, BasicBlockId::new(1), BasicBlockId::new(2));
    assert_return_terminator(&body, BasicBlockId::new(2));

    let expected_first = Targets {
        interpreter: true,
        postgres: true,
        embedding: false,
    }
    .compile();
    let expected_second = Targets {
        interpreter: true,
        postgres: false,
        embedding: false,
    }
    .compile();

    assert_eq!(targets[BasicBlockId::new(0)], expected_first);
    assert_eq!(targets[BasicBlockId::new(1)], expected_second);
    assert_eq!(targets[BasicBlockId::new(2)], expected_first);
}

#[test]
fn offset_terminator_moves_to_last() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true]], //
        [[true, false]],
        [[false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let _targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_return_terminator(&body, BasicBlockId::new(1));
}

#[test]
fn offset_goto_chain_created() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, c: Int;

        bb0() {
            a = load 1;
            b = load 2;
            c = load 3;
            return c;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true, true]],
        [[true, false, true]],
        [[false, false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let _targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_eq!(body.basic_blocks.len(), 3);
    assert_goto_terminator(&body, BasicBlockId::new(0));
    assert_goto_terminator(&body, BasicBlockId::new(1));
    assert_return_terminator(&body, BasicBlockId::new(2));
}

#[test]
fn offset_goto_targets_correct() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, c: Int;

        bb0() {
            a = load 1;
            b = load 2;
            c = load 3;
            return c;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true, true]],
        [[true, false, true]],
        [[false, false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let _targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_eq!(body.basic_blocks.len(), 3);
    assert_goto_target(&body, BasicBlockId::new(0), BasicBlockId::new(1));
    assert_goto_target(&body, BasicBlockId::new(1), BasicBlockId::new(2));
    assert_return_terminator(&body, BasicBlockId::new(2));
}

#[test]
fn offset_statements_split_correctly() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true]], //
        [[true, false]],
        [[false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let _targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_assignment_locals(&body, BasicBlockId::new(0), &["x"]);
    assert_assignment_locals(&body, BasicBlockId::new(1), &["y"]);
}

#[test]
fn offset_statement_order_preserved() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, c: Int;

        bb0() {
            a = load 1;
            b = load 2;
            c = load 3;
            return c;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true, true]],
        [[true, false, false]],
        [[false, false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let _targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_assignment_locals(&body, BasicBlockId::new(0), &["a"]);
    assert_assignment_locals(&body, BasicBlockId::new(1), &["b", "c"]);
}

#[test]
fn offset_targets_populated() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true]], //
        [[true, false]],
        [[false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    let expected_first = Targets {
        interpreter: true,
        postgres: true,
        embedding: false,
    }
    .compile();
    let expected_second = Targets {
        interpreter: true,
        postgres: false,
        embedding: false,
    }
    .compile();

    assert_eq!(targets[BasicBlockId::new(0)], expected_first);
    assert_eq!(targets[BasicBlockId::new(1)], expected_second);
}

// =============================================================================
// split() Integration Tests (Snapshots)
// =============================================================================

fn format_bitset(bitset: TargetBitSet) -> impl Display {
    fmt::from_fn(move |f| {
        let mut parts = Vec::new();
        if bitset.contains(TargetId::Interpreter) {
            parts.push("Interpreter");
        }
        if bitset.contains(TargetId::Postgres) {
            parts.push("Postgres");
        }
        if bitset.contains(TargetId::Embedding) {
            parts.push("Embedding");
        }

        if parts.is_empty() {
            write!(f, "<none>")
        } else {
            write!(f, "{{{}}}", parts.join(", "))
        }
    })
}

fn format_targets(targets: &BasicBlockSlice<TargetBitSet>) -> impl Display + '_ {
    fmt::from_fn(move |f| {
        writeln!(f, "Block Targets:")?;
        for (idx, bitset) in targets.iter_enumerated() {
            writeln!(f, "  {}: {}", idx, format_bitset(*bitset))?;
        }
        Ok(())
    })
}

struct CostVecFormatAnnotation<'ctx, A: Allocator>(&'ctx TargetArray<StatementCostVec<A>>);

impl<A: Allocator> TextFormatAnnotations for CostVecFormatAnnotation<'_, A> {
    type StatementAnnotation<'this, 'heap>
        = impl Display
    where
        Self: 'this;

    fn annotate_statement<'heap>(
        &self,
        location: Location,
        _: &Statement<'heap>,
    ) -> Option<Self::StatementAnnotation<'_, 'heap>> {
        let mut value = String::with_capacity(4);

        for (target_id, costs) in self.0.iter_enumerated() {
            if costs.get(location).is_none() {
                continue;
            }

            match target_id {
                TargetId::Interpreter => value.push('I'),
                TargetId::Postgres => value.push('P'),
                TargetId::Embedding => value.push('E'),
            }
        }

        if value.is_empty() {
            return None;
        }

        Some(value)
    }
}

#[track_caller]
fn assert_split<'heap, A: Allocator>(
    name: &'static str,
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    costs: &TargetArray<StatementCostVec<A>>,
    targets: &BasicBlockSlice<TargetBitSet>,
) {
    let formatter = Formatter::new(context.heap);
    let type_formatter = TypeFormatter::new(&formatter, context.env, TypeFormatterOptions::terse());

    let mut text_format = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: type_formatter,
        annotations: CostVecFormatAnnotation(costs),
    }
    .build();

    text_format.format_body(body).expect("formatting failed");

    write!(text_format.writer, "\n\n{:=^50}\n\n", " Block Targets ").expect("infallible");

    write!(text_format.writer, "{}", format_targets(targets)).expect("formatting failed");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/execution/splitting"));
    settings.set_prepend_module_to_snapshot(false);

    let _guard = settings.bind_to_scope();

    let output = String::from_utf8_lossy(&text_format.writer);
    assert_snapshot!(name, output);
}

#[test]
fn split_no_changes_needed() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true]], //
        [[true, true]],
        [[false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);

    let splitting = BasicBlockSplitting::new();
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let targets = splitting.split(&context, &mut body, &mut costs, &mut terminator_costs);

    assert_split("split_no_changes_needed", &context, &body, &costs, &targets);
}

#[test]
fn split_basic_two_regions() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true]], //
        [[true, false]],
        [[false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);

    let splitting = BasicBlockSplitting::new();
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let targets = splitting.split(&context, &mut body, &mut costs, &mut terminator_costs);

    assert_split("split_basic_two_regions", &context, &body, &costs, &targets);
}

#[test]
fn split_multi_block_complex() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, c: Int, d: Int;

        bb0() {
            a = load 1;
            b = load 2;
            goto bb1();
        },
        bb1() {
            c = load 3;
            d = load 4;
            return d;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true], [true, true]],
        [[true, false], [false, true]],
        [[false, false], [false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);

    let splitting = BasicBlockSplitting::new();
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let targets = splitting.split(&context, &mut body, &mut costs, &mut terminator_costs);

    assert_split(
        "split_multi_block_complex",
        &context,
        &body,
        &costs,
        &targets,
    );
}

#[test]
fn split_cost_remap() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int;

        bb0() {
            x = load 1;
            y = load 2;
            z = load 3;
            return z;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true, true]],
        [[true, false, true]],
        [[false, false, false]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);

    let splitting = BasicBlockSplitting::new();
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let targets = splitting.split(&context, &mut body, &mut costs, &mut terminator_costs);

    assert_split("split_cost_remap", &context, &body, &costs, &targets);
}

#[test]
fn split_block_references_updated() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, cond: Bool;

        bb0() {
            x = load 1;
            y = load 2;
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            return x;
        },
        bb2() {
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let patterns = TargetArray::from_raw([
        [[true, true, true].as_slice(), [].as_slice(), [].as_slice()],
        [&[true, false, true], &[], &[]],
        [&[false, false, false], &[], &[]],
    ]);
    let mut costs = make_target_costs(&body, patterns, &heap);

    let splitting = BasicBlockSplitting::new();
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let targets = splitting.split(&context, &mut body, &mut costs, &mut terminator_costs);

    assert_split(
        "split_block_references_updated",
        &context,
        &body,
        &costs,
        &targets,
    );
}

/// One statement, terminator is superset of statement support: no extra region.
#[test]
fn count_regions_terminator_superset_no_split() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    // Statement supported on {I, P}
    let patterns = TargetArray::from_raw([[[true]], [[true]], [[false]]]);
    let costs = make_target_costs(&body, patterns, &heap);
    // Terminator supported on {I, P, E} (superset)
    let terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 1);
    assert!(!regions[BasicBlockId::new(0)].1);
}

/// One statement, terminator is strict subset: extra region needed.
#[test]
fn count_regions_terminator_subset_splits() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    // Statement supported on {I, P}
    let patterns = TargetArray::from_raw([[[true]], [[true]], [[false]]]);
    let costs = make_target_costs(&body, patterns, &heap);
    // Terminator supported only on {I}
    let terminator_costs = make_terminator_costs(
        &body,
        TargetArray::from_raw([[true], [false], [false]]),
        &heap,
    );
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 2);
    assert!(regions[BasicBlockId::new(0)].1);
}

/// One statement, terminator is incomparable with statement support: extra region needed.
#[test]
fn count_regions_terminator_incomparable_splits() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    // Statement supported on {P, I}
    let patterns = TargetArray::from_raw([[[true]], [[true]], [[false]]]);
    let costs = make_target_costs(&body, patterns, &heap);
    // Terminator supported on {E, I} (incomparable with {P, I})
    let terminator_costs = make_terminator_costs(
        &body,
        TargetArray::from_raw([[true], [false], [true]]),
        &heap,
    );
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 2);
    assert!(regions[BasicBlockId::new(0)].1);
}

/// Zero statements: always 1 region, no terminator split (block IS the terminator).
#[test]
fn count_regions_zero_statements_no_split() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    let costs = TargetArray::from_fn(|_| StatementCostVec::new_in(&body.basic_blocks, &heap));
    // Terminator only on {I}
    let terminator_costs = make_terminator_costs(
        &body,
        TargetArray::from_raw([[true], [false], [false]]),
        &heap,
    );
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 1);
    assert!(!regions[BasicBlockId::new(0)].1);
}

/// Multiple statement runs, terminator doesn't narrow last run: no extra region.
#[test]
fn count_regions_multiple_runs_terminator_superset() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    // First stmt: {I, P}, second stmt: {I}
    let patterns = TargetArray::from_raw([[[true, true]], [[true, false]], [[false, false]]]);
    let costs = make_target_costs(&body, patterns, &heap);
    // Terminator on {I, P, E} (superset of last run {I})
    let terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    // 2 statement runs, no terminator split
    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 2);
    assert!(!regions[BasicBlockId::new(0)].1);
}

/// Multiple statement runs, terminator narrows last run: extra region.
#[test]
fn count_regions_multiple_runs_terminator_narrows() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    // First stmt: {I, P}, second stmt: {I, P}
    let patterns = TargetArray::from_raw([[[true, true]], [[true, true]], [[false, false]]]);
    let costs = make_target_costs(&body, patterns, &heap);
    // Terminator only on {I}
    let terminator_costs = make_terminator_costs(
        &body,
        TargetArray::from_raw([[true], [false], [false]]),
        &heap,
    );
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    // 1 statement run + 1 terminator region
    assert_eq!(regions[BasicBlockId::new(0)].0.get(), 2);
    assert!(regions[BasicBlockId::new(0)].1);
}

/// One statement + narrowed terminator produces 2 blocks with correct affinities.
#[test]
fn offset_terminator_narrowing_creates_split() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // Statement supported on {I, P}
    let patterns = TargetArray::from_raw([[[true]], [[true]], [[false]]]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    // Terminator only on {I}
    let mut terminator_costs = make_terminator_costs(
        &body,
        TargetArray::from_raw([[true], [false], [false]]),
        &heap,
    );
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    // Should produce 2 blocks
    assert_eq!(body.basic_blocks.len(), 2);

    // First block has the statement, second is empty (terminator only)
    assert_assignment_locals(&body, BasicBlockId::new(0), &["x"]);
    assert_eq!(body.basic_blocks[BasicBlockId::new(1)].statements.len(), 0);

    // First block has Goto to second, second has the original Return
    assert_goto_target(&body, BasicBlockId::new(0), BasicBlockId::new(1));
    assert_return_terminator(&body, BasicBlockId::new(1));

    // Affinities: first {I, P}, second {I}
    let expected_statements = Targets {
        interpreter: true,
        postgres: true,
        embedding: false,
    }
    .compile();
    let expected_terminator = Targets {
        interpreter: true,
        postgres: false,
        embedding: false,
    }
    .compile();
    assert_eq!(targets[BasicBlockId::new(0)], expected_statements);
    assert_eq!(targets[BasicBlockId::new(1)], expected_terminator);
}

/// Empty block with restricted terminator gets its affinity from the terminator.
#[test]
fn offset_empty_block_uses_terminator_affinity() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let costs = TargetArray::from_fn(|_| StatementCostVec::new_in(&body.basic_blocks, &heap));
    // Only interpreter supports the terminator
    let mut terminator_costs = make_terminator_costs(
        &body,
        TargetArray::from_raw([[true], [false], [false]]),
        &heap,
    );
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let mut costs = costs;
    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    // Still 1 block, no split
    assert_eq!(body.basic_blocks.len(), 1);

    let expected = Targets {
        interpreter: true,
        postgres: false,
        embedding: false,
    }
    .compile();
    assert_eq!(targets[BasicBlockId::new(0)], expected);
}

/// Two statement runs + disjoint terminator produces 3 blocks.
#[test]
fn offset_two_runs_plus_terminator_split() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // First stmt: {P} only, second stmt: {E} only
    let patterns = TargetArray::from_raw([[[false, false]], [[true, false]], [[false, true]]]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    // Terminator only on {I}
    let mut terminator_costs = make_terminator_costs(
        &body,
        TargetArray::from_raw([[true], [false], [false]]),
        &heap,
    );
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    assert_eq!(body.basic_blocks.len(), 3);

    // Affinities: {P}, {E}, {I}
    let expected_p = Targets {
        interpreter: false,
        postgres: true,
        embedding: false,
    }
    .compile();
    let expected_e = Targets {
        interpreter: false,
        postgres: false,
        embedding: true,
    }
    .compile();
    let expected_i = Targets {
        interpreter: true,
        postgres: false,
        embedding: false,
    }
    .compile();
    assert_eq!(targets[BasicBlockId::new(0)], expected_p);
    assert_eq!(targets[BasicBlockId::new(1)], expected_e);
    assert_eq!(targets[BasicBlockId::new(2)], expected_i);

    // Last block has the original return, others have gotos
    assert_goto_terminator(&body, BasicBlockId::new(0));
    assert_goto_terminator(&body, BasicBlockId::new(1));
    assert_return_terminator(&body, BasicBlockId::new(2));
}

/// Terminator cost remap after split: last block gets original cost, Goto blocks get zero.
#[test]
fn terminator_cost_remap_after_split() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // Two statement runs: {I,P} then {I}
    let patterns = TargetArray::from_raw([[[true, true]], [[true, false]], [[false, false]]]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);

    let splitting = BasicBlockSplitting::new();
    let _targets = splitting.split(&context, &mut body, &mut costs, &mut terminator_costs);

    // After split: 2 blocks. First has Goto (zero cost), second has original Return.
    assert_eq!(body.basic_blocks.len(), 2);

    for target in TargetId::all() {
        // Goto block gets zero cost
        assert_eq!(
            terminator_costs[target].of(BasicBlockId::new(0)),
            Some(cost!(0))
        );
        // Original terminator block keeps the original cost
        assert_eq!(
            terminator_costs[target].of(BasicBlockId::new(1)),
            Some(cost!(1))
        );
    }
}

/// Terminator is strict superset of statement support: no split occurs.
#[test]
fn offset_terminator_superset_no_split() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 42;
            return x;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // Statement: {P} only
    let patterns = TargetArray::from_raw([[[false]], [[true]], [[false]]]);
    let mut costs = make_target_costs(&body, patterns, &heap);
    // Terminator: {I, P, E} (superset)
    let mut terminator_costs = make_all_supported_terminator_costs(&body, &heap);
    let regions = count_regions(&body, &costs, &terminator_costs, Global);

    let targets = offset_basic_blocks(
        &context,
        &mut body,
        &regions,
        &mut costs,
        &mut terminator_costs,
        Global,
        Global,
    );

    // No split
    assert_eq!(body.basic_blocks.len(), 1);

    // Affinity comes from statements: {P}
    let expected = Targets {
        interpreter: false,
        postgres: true,
        embedding: false,
    }
    .compile();
    assert_eq!(targets[BasicBlockId::new(0)], expected);
}
