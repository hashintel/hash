# TraversalLivenessAnalysis Test Plan

## Overview

`TraversalLivenessAnalysis` extends standard liveness analysis with traversal-aware semantics: when assigning to a local that is a known traversal destination, uses of the traversal source are **not** generated. This prevents the source (e.g., `entity`) from being marked live when only its partial projections (e.g., `entity.uuid`) are actually needed.

## Testing Strategy

Based on the HashQL testing strategies, this analysis should be tested using:

1. **MIR Builder Tests** (primary) — `body!` macro with insta snapshots
2. **Comparison with `LivenessAnalysis`** — demonstrate the difference in behavior

Snapshots go in `tests/ui/pass/liveness/` to colocate with existing liveness tests.

## Test Infrastructure

### Required Setup

```rust
fn assert_traversal_liveness<'heap>(
    name: &'static str,
    env: &Environment<'heap>,
    body: &Body<'heap>,
    traversals: &Traversals<'heap>,
) {
    let results = TraversalLivenessAnalysis { traversals }.iterate_to_fixpoint(body);
    // Format and snapshot similar to existing assert_liveness
}
```

### Comparison Helper

For tests that demonstrate the difference between `LivenessAnalysis` and `TraversalLivenessAnalysis`:

```rust
fn assert_liveness_comparison<'heap>(
    name: &'static str,
    env: &Environment<'heap>,
    body: &Body<'heap>,
    traversals: &Traversals<'heap>,
) {
    let standard = LivenessAnalysis.iterate_to_fixpoint(body);
    let traversal = TraversalLivenessAnalysis { traversals }.iterate_to_fixpoint(body);
    // Format both side-by-side in snapshot
}
```

## Test Cases

### 1. Basic Behavior

#### 1.1 `traversal_skips_source_use`

**Purpose**: Verify that assigning to a traversal local does not mark the source as live.

```rust
// Setup: traversals.source = _1, traversals contains _2
bb0() {
    _2 = load _1.0;  // Should NOT gen _1
    return _2;
}
```

**Expected**: `_1` is NOT live at entry (traversal semantics).

---

#### 1.2 `non_traversal_preserves_source_use`

**Purpose**: Regular assignments (not to traversal locals) still gen the source.

```rust
// Setup: traversals.source = _1, traversals contains _2 but NOT _3
bb0() {
    _3 = load _1.0;  // _3 not in traversals, SHOULD gen _1
    return _3;
}
```

**Expected**: `_1` IS live at entry.

---

#### 1.3 `mixed_traversal_and_regular_uses`

**Purpose**: Source becomes live only when used in non-traversal context.

```rust
// Setup: traversals.source = _1, traversals contains _2
bb0() {
    _2 = load _1.0;  // Traversal: no gen for _1
    _3 = load _1;    // Direct use: gens _1
    return _2;
}
```

**Expected**: `_1` IS live (due to `_3 = load _1`).

---

### 2. Projection Patterns

#### 2.1 `nested_projection_skipped`

**Purpose**: Deep projections from source are still skipped when assigned to traversal local.

```rust
// Setup: traversals.source = _1, traversals contains _2
bb0() {
    _2 = load _1.0.1.2;  // Deep projection, still a traversal
    return _2;
}
```

**Expected**: `_1` NOT live.

---

#### 2.2 `different_source_not_skipped`

**Purpose**: Only projections from the designated source are skipped.

```rust
// Setup: traversals.source = _1, traversals contains _3
bb0() {
    _3 = load _2.0;  // _2 is not the source
    return _3;
}
```

**Expected**: `_2` IS live (not the traversal source, so normal liveness applies).

---

### 3. Control Flow

#### 3.1 `traversal_across_blocks`

**Purpose**: Traversal skipping works correctly across basic block boundaries.

```rust
// Setup: traversals.source = _1, traversals contains _2
bb0() {
    goto bb1();
},
bb1() {
    _2 = load _1.0;
    return _2;
}
```

**Expected**: `_1` NOT live at entry of bb0 or bb1.

---

#### 3.2 `traversal_in_one_branch`

**Purpose**: Diamond CFG where one branch uses traversal, other uses source directly.

```rust
// Setup: traversals.source = _1, traversals contains _2
bb0() {
    if _cond then bb1() else bb2();
},
bb1() {
    _2 = load _1.0;  // Traversal
    goto bb3(_2);
},
bb2() {
    _3 = load _1;    // Direct use
    goto bb3(_3);
},
bb3(_result) {
    return _result;
}
```

**Expected**: `_1` IS live at bb0 entry (due to bb2 path).

---

#### 3.3 `traversal_in_loop`

**Purpose**: Traversal semantics in loop don't incorrectly propagate source liveness.

```rust
// Setup: traversals.source = _1, traversals contains _2
bb0() {
    goto bb1();
},
bb1() {
    _2 = load _1.0;
    _cond = bin.< _2 10;
    if _cond then bb1() else bb2();
},
bb2() {
    return _2;
}
```

**Expected**: `_1` NOT live (only traversal access in loop).

---

### 4. Edge Cases

#### 4.1 `empty_traversals`

**Purpose**: Empty traversal set behaves like standard liveness.

```rust
// Setup: traversals.source = _1, traversals is EMPTY
bb0() {
    _2 = load _1.0;
    return _2;
}
```

**Expected**: `_1` IS live (no traversal locals to skip for).

---

#### 4.2 `source_also_traversal_destination`

**Purpose**: Edge case where source local is also in traversal set (if possible).

This may be a degenerate case — document whether it can occur.

---

#### 4.3 `multiple_traversal_locals_same_source`

**Purpose**: Multiple traversal destinations all skip the same source.

```rust
// Setup: traversals.source = _1, traversals contains {_2, _3, _4}
bb0() {
    _2 = load _1.0;
    _3 = load _1.1;
    _4 = load _1.2;
    _5 = tuple _2, _3, _4;
    return _5;
}
```

**Expected**: `_1` NOT live.

---

#### 4.4 `lhs_has_projections`

**Purpose**: Assignment with projections on LHS does not trigger traversal skip.

```rust
// Setup: traversals.source = _1, traversals contains _2
bb0() {
    _2.0 = load _1.0;  // LHS has projection — not a full Def
    return _2;
}
```

**Expected**: Check current behavior. The condition `lhs.projections.is_empty()` should prevent skip, so `_1` IS live.

---

### 5. Comparison Tests

#### 5.1 `standard_vs_traversal_liveness`

**Purpose**: Directly compare outputs of both analyses on the same body.

Show that:

- `LivenessAnalysis` marks `_1` as live
- `TraversalLivenessAnalysis` does NOT mark `_1` as live

This is the key demonstration that the analysis works as intended.

---

### 6. Integration Scenarios

#### 6.1 `graph_read_filter_pattern`

**Purpose**: Real-world pattern from `TraversalExtraction` — graph read filter with vertex projections.

```rust
// Source: GraphReadFilter
// Setup: traversals.source = _1 (vertex), traversals contains extracted locals
[graph::read::filter]@0/2 -> Bool {
    decl env: (), vertex: Entity;
    @proj uuid = vertex.entity_uuid: Uuid;

    bb0() {
        _2 = load uuid;       // Extracted traversal
        _3 = bin.== _2 ...;
        return _3;
    }
}
```

**Expected**: `vertex` (_1) NOT live.

---

## Implementation Checklist

- [ ] Add `format_traversal_liveness_result` helper (or reuse existing)
- [ ] Add `assert_traversal_liveness` test helper
- [ ] Create `Traversals` instances for tests (may need constructor or builder)
- [ ] Implement each test case
- [ ] Create snapshot directory: `tests/ui/pass/liveness/` (already exists)
- [ ] Verify test naming follows convention: `traversal_*`

## Open Questions

1. **Traversals construction**: How do we create `Traversals` in tests without running `TraversalExtraction`? May need a test helper or expose `Traversals::with_capacity_in` + `insert`.

2. **Projection syntax**: Does the `body!` macro support projections that match the traversal extraction pattern? See `@proj` syntax in MIR builder guide.

3. **Source type requirement**: `TraversalExtraction` only runs on `GraphReadFilter` bodies. Should `TraversalLivenessAnalysis` tests use that source type, or is it source-agnostic?
