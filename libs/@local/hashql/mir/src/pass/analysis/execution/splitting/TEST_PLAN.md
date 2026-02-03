# Test Plan: Basic Block Splitting

## Overview

This test plan covers the basic block splitting infrastructure. Each internal function is tested directly for separation of concerns.

## Functions Under Test

1. **`supported()`** – Builds a `TargetBitSet` from cost slices at a given statement index
2. **`count_regions()`** – Counts how many regions each block needs based on support changes
3. **`offset_basic_blocks()`** – Remaps IDs, splits statements, creates goto chains, populates targets
4. **`BasicBlockSplitting::split()`** – Public API integrating the above

---

## 1. `supported()` Tests (4 tests)

Tests for building `TargetBitSet` from cost arrays.

| Test | Description | Verify |
|------|-------------|--------|
| `supported_all_targets` | All targets have `Some(cost)` → all bits set | `assert_eq!(bitset, expected)` |
| `supported_no_targets` | All targets have `None` → empty bitset | `assert!(bitset.is_empty())` |
| `supported_single_target` | Only one target has `Some(cost)` → single bit | `assert!(bitset.contains(id))` |
| `supported_mixed_targets` | Subset of targets supported → correct bits | `assert_eq!(bitset, expected)` |

---

## 2. `count_regions()` Tests (6 tests)

Tests for counting required regions per block.

| Test | Description | Verify |
|------|-------------|--------|
| `count_regions_empty_block` | 0 statements → 1 region (no split) | `assert_eq!(regions[bb0].get(), 1)` |
| `count_regions_single_statement` | 1 statement → 1 region (no split) | `assert_eq!(regions[bb0].get(), 1)` |
| `count_regions_uniform_support` | N statements, all same support → 1 region | `assert_eq!(regions[bb0].get(), 1)` |
| `count_regions_two_regions` | Support changes once → 2 regions | `assert_eq!(regions[bb0].get(), 2)` |
| `count_regions_three_regions` | Support changes twice → 3 regions | `assert_eq!(regions[bb0].get(), 3)` |
| `count_regions_alternating` | Alternating support per statement → N regions | `assert_eq!(regions[bb0].get(), n)` |

---

## 3. `offset_basic_blocks()` Tests (10 tests)

Tests for the core splitting logic.

### Block Structure

| Test | Description | Verify |
|------|-------------|--------|
| `offset_single_block_no_split` | Single block, 1 region → unchanged structure | `assert_eq!(body.basic_blocks.len(), 1)` |
| `offset_single_block_splits` | Single block, 2 regions → 2 blocks | `assert_eq!(body.basic_blocks.len(), 2)` |
| `offset_multiple_blocks_no_splits` | Multiple blocks, all 1 region → only ID remap | `assert_eq!(body.basic_blocks.len(), n)` |
| `offset_multiple_blocks_mixed` | Some blocks split, others don't | `assert_eq!(body.basic_blocks.len(), expected)` |

### Terminator Handling

| Test | Description | Verify |
|------|-------------|--------|
| `offset_terminator_moves_to_last` | Original terminator ends up on final split block | `matches!(last.terminator.kind, original)` |
| `offset_goto_chain_created` | Split blocks connected via goto terminators | `matches!(bb.terminator.kind, Goto { .. })` |
| `offset_goto_targets_correct` | Each goto points to the next block in chain | `assert_eq!(goto.target.block, next_id)` |

### Statement Distribution

| Test | Description | Verify |
|------|-------------|--------|
| `offset_statements_split_correctly` | Statements distributed to correct regions | `assert_eq!(bb.statements.len(), expected)` |
| `offset_statement_order_preserved` | Statement order maintained within regions | Compare statement locals in order |

### Target BitSet Population

| Test | Description | Verify |
|------|-------------|--------|
| `offset_targets_populated` | Each block gets correct `TargetBitSet` | `assert_eq!(targets[bb], expected_bitset)` |

---

## 4. `split()` Integration Tests (5 tests)

End-to-end tests through the public API. Use **snapshots** for easier verification of full MIR output.

| Test | Description | Verify |
|------|-------------|--------|
| `split_no_changes_needed` | Uniform support → body unchanged, targets populated | Snapshot |
| `split_basic_two_regions` | Simple split scenario | Snapshot |
| `split_multi_block_complex` | Multiple blocks with varying split counts | Snapshot |
| `split_cost_remap` | `StatementCostVec` correctly remapped after split | Snapshot |
| `split_block_references_updated` | Terminators referencing other blocks update correctly | Snapshot |

Snapshot format includes:

- MIR body text (via `TextFormatOptions`)
- `TargetBitSet` per block
- Cost vector state after remap

---

## Total: 25 tests

- `supported()`: 4 tests
- `count_regions()`: 6 tests  
- `offset_basic_blocks()`: 10 tests
- `split()`: 5 tests

---

## Implementation Notes

### Visibility

`supported()` and `count_regions()` are currently private. Options:

1. Add `#[cfg(test)]` visibility (`pub(super)`)
2. Use `#[cfg(test)] mod tests` inside the module (already has access)

Recommend option 2 – tests in the same module have access to private functions.

### Test Utilities

```rust
fn make_target_costs<'heap>(
    heap: &'heap Heap,
    body: &Body<'heap>,
    patterns: TargetArray<&[&[bool]]>,
) -> TargetArray<StatementCostVec<&'heap Heap>>
```

Helper to build costs from boolean patterns (true = `Some(cost!(1))`, false = `None`).

### Test File Location

```
libs/@local/hashql/mir/src/pass/analysis/execution/splitting/tests.rs
```

## Design Decisions

1. **Test each function directly** – separation of concerns, pinpoint failures
2. **Assertion tests over snapshots** – structural invariants easier to verify directly
3. **No malformed MIR tests** – empty body is a precondition (`debug_assert`)
