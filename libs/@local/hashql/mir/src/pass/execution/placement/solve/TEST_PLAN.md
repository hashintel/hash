# Placement Solver Test Plan

Tests for `libs/@local/hashql/mir/src/pass/execution/placement/solve/`.

## Setup Pattern

Every test that touches the solver follows the arc consistency test pattern:

- Build a `Body` with the `body!` macro
- Manually construct `TerminatorCostVec` and set `TransMatrix` per edge
- Construct `StatementCostVec` and assign per-statement costs per target
- Set `TargetBitSet` domains per block
- Construct `PlacementContext` and run through `PlacementSolver`

Shared helpers:

- `target_set(&[TargetId]) -> TargetBitSet` — build a domain from a list
- `all_targets() -> TargetBitSet` — {I, P, E}
- `bb(n) -> BasicBlockId` — shorthand
- `full_matrix() -> TransMatrix` — all transitions allowed at cost 1
- `same_target_matrix() -> TransMatrix` — only I→I, P→P, E→E at cost 0

---

## 1. TargetHeap (pure unit tests, no Body)

### `heap_insert_maintains_sorted_order`

Insert three elements: (P, cost=30), (I, cost=10), (E, cost=20).
Pop all three. Assert order: I(10), E(20), P(30).
**Why:** Pop must return cheapest first — every value-ordering decision depends on this.

### `heap_pop_exhaustion`

Insert (I, cost=5) and (P, cost=10). Pop three times.
Assert: first = I(5), second = P(10), third = None. `is_empty()` = true, `len()` = 0.
**Why:** Solver uses `pop() == None` to detect "no more alternatives" in rollback and retry.

### `heap_peek_does_not_consume`

Insert (I, cost=7). Peek — returns I(7). Peek again — same I(7). Pop — returns I(7). Peek — returns None.
Assert `len()` is 1 before pop, 0 after.
**Why:** `retry()` uses `peek()` for delta computation without consuming. If peek advances the index, perturbation computes wrong deltas.

### `heap_reset_clears_state`

Insert (I, cost=5) and (P, cost=10). Pop one. Reset. Assert `is_empty()` = true, `len()` = 0, `pop()` = None.
**Why:** `seed()` relies on heaps starting clean.

### `heap_equal_cost_elements`

Insert (I, cost=5) and (P, cost=5). Pop both. Assert both are returned (order between them is unspecified but both must appear).
**Why:** Equal-cost targets are valid — the heap must not lose elements on tie.

---

## 2. CostEstimation (needs Body + Condensation)

### `self_loop_edges_excluded_from_cost`

**Body:** `bb0: cond = load true; if cond then bb0() else bb1()`. `bb1: return x`.
**Setup:** bb0 domain = {I, P}. Self-edge TransMatrix: I→P = 100, P→I = 100, I→I = 0, P→P = 0. Exit edge bb0→bb1: all transitions cost 0. Statement cost: bb0 I = 5, bb0 P = 5.
**Fix bb1 to I.** Estimate bb0 for target I.
**Assert:** Cost = 5 (statement only + 0 for exit edge). The self-edge's I→P=100 must NOT contribute.
**Why:** Self-loops are same-target by definition. Including cross-target costs would inflate estimates with impossible transitions.

### `boundary_multiplier_applied_to_cross_region_edges`

**Body:** bb0 → bb1 → bb2. Three trivial SCCs (no loops).
**Setup:** All domains = {I, P}. Statement costs = 0 everywhere. TransMatrix on bb0→bb1: I→P = 20, all others = 0. TransMatrix on bb1→bb2: same.
**Fix bb0 = I, bb2 = I.**
Estimate bb1 for target P with `CostEstimationConfig::TRIVIAL` (multiplier 1.0): cost = 0 (stmt) + 20 (I→P from bb0) + 20 (P→I to bb2... wait, we need P→I in bb1→bb2). Adjust: bb1→bb2 TransMatrix: P→I = 20. So cost = 0 + 20 + 20 = 40.
Estimate bb1 for target P with `CostEstimationConfig::LOOP` (multiplier 0.5): cost = 0 + 10 + 10 = 20.
**Assert:** TRIVIAL estimate = 40, LOOP estimate = 20.
**Why:** Boundary multiplier controls SCC-internal vs cross-region weighting. If not applied, the solver over-weights boundary edges when solving loops.

### `infeasible_transition_returns_none`

**Body:** bb0 → bb1. Two trivial SCCs.
**Setup:** bb0 domain = {P}, bb1 domain = {I, P}. TransMatrix on bb0→bb1: only I→I allowed (nothing from P).
**Fix bb0 = P.** Estimate bb1 for target I.
**Assert:** Returns `None` — no transition exists from P to I in this matrix.
**Why:** Infeasible estimates must return None so the target is excluded from the heap, preventing assignments that violate edge constraints.

### `unassigned_neighbor_uses_heuristic_minimum`

**Body:** bb0 → bb1. Two trivial SCCs.
**Setup:** bb0 domain = {I, P}, bb1 domain = {I, P}. TransMatrix on bb0→bb1: I→I = 0, I→P = 10, P→I = 5, P→P = 0. Statement costs: bb1 I = 3, bb1 P = 7.
**bb0 is NOT assigned (determine_target returns None).**
Estimate bb1 for target I.
**Assert:** The transition cost uses the heuristic minimum: for each source in bb0's domain, find min(cost + bb0_stmt_cost). The `transition_cost(None, Some(I))` branch finds the cheapest source. This should be the minimum over {I→I=0, P→I=5} weighted by bb0's statement costs.
**Why:** Forward pass estimates with unassigned predecessors. The heuristic must pick the optimistic minimum, not panic or return None.

---

## 3. Forward Checking / narrow()

All tests construct a `ConstraintSatisfaction` and call `narrow_impl` directly (static method, accessible from child test module).

### `narrow_restricts_successor_domain`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit.
**Setup:** PlacementBlocks for bb0, bb1, bb2 all with domain = {I, P, E}. TransMatrix on bb0→bb1: I→I and I→P only (no I→E, no P→*, no E→*).
**Call `narrow_impl` for bb0 = I.**
**Assert:** bb1.possible = {I, P}. bb2.possible = {I, P, E} (unchanged — not a direct successor of bb0).
**Why:** Successor narrowing removes targets with no valid incoming transition from the assigned source.

### `narrow_restricts_predecessor_domain`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit.
**Setup:** All domains = {I, P, E}. TransMatrix on bb2→bb0: I→I and P→I only (E→I not present).
**Call `narrow_impl` for bb0 = I.**
**Assert:** bb2.possible = {I, P} (E removed — no E→I transition). bb1.possible = {I, P, E} (unchanged — not a direct predecessor of bb0 within the SCC cycle; bb0→bb1 is bb0 as source, not bb1 as predecessor of bb0).
**Why:** Bidirectional narrowing is essential. Without predecessor direction, the CSP assigns targets to predecessors with no valid transition to the just-assigned block. This was a real bug caught during implementation.

### `narrow_to_empty_domain`

**Body:** 2-block SCC: bb0 ↔ bb1, plus bb2 exit.
**Setup:** bb0 domain = {I}, bb1 domain = {P}. TransMatrix on bb0→bb1: only I→I (no I→P).
**Call `narrow_impl` for bb0 = I.**
**Assert:** bb1.possible is empty (P removed, nothing left).
**Why:** Empty domain after narrowing is how forward checking detects infeasibility. The solver must check for this and trigger rollback.

### `narrow_multiple_edges_intersect`

**Body:** 3-block SCC where bb0 → bb2 and bb1 → bb2 (two predecessors for bb2), bb2 → bb0. Plus exit.
**Setup:** bb2 domain = {I, P, E}. TransMatrix bb0→bb2: allows {I, P} as targets. TransMatrix bb1→bb2: allows {P, E} as targets.
**Assign bb0 = I, narrow. Then assign bb1 = P, narrow again.**
**Assert:** After first narrow, bb2.possible ⊇ {I, P} (from bb0's constraint). After second narrow, bb2.possible = {P} (intersection of {I, P} and {P, E}).
**Why:** Multiple narrowing steps must intersect, not replace. If a second narrow overwrites instead of intersecting, constraints from earlier assignments are lost.

### `replay_narrowing_resets_then_repropagates`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit.
**Setup:** All domains = {I, P, E}. TransMatrix on bb0→bb1: I→I and I→P only. TransMatrix on bb0→bb1 for P: P→E only.
**Sequence:**

1. Set depth = 0. Assign bb0 = I at blocks[0]. Set depth = 1.
2. Call `narrow` — bb1 narrowed to {I, P}.
3. Now simulate rollback: change blocks[0].target to P. Set depth = 1.
4. Call `replay_narrowing`.
**Assert:** bb1.possible is reset from {I, P} to whatever P→* allows (should be {E} from P→E). bb2.possible is reset to original domain {I, P, E} (no constraint from bb0 directly).
**Why:** replay_narrowing is the undo+redo mechanism for rollback. It must reset domains to the original assignment bitset, then re-propagate from the entire fixed prefix. If it doesn't reset first, stale narrowing persists.

---

## 4. Lower Bound

Tests construct a `ConstraintSatisfaction`, set up fixed/unfixed blocks, and call `lower_bound` directly.

### `lower_bound_min_statement_cost_per_block`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit.
**Setup:** Fix bb0 (depth = 1). bb1 domain = {I, P}, bb2 domain = {I, P}. Statement costs: bb1 I=10 P=20, bb2 I=5 P=15. All transitions cost 0.
**Assert:** lower_bound ≥ 15 (= min(10,20) + min(5,15)). With zero transition costs, lower_bound = 15 exactly.
**Why:** Per-block minimum statement cost is the tightest single-block contribution to the bound.

### `lower_bound_min_transition_cost_per_edge`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit.
**Setup:** Fix bb0 (depth = 1). bb1 domain = {I, P}, bb2 domain = {I, P}. Statement costs = 0 everywhere. TransMatrix on bb1→bb2: I→I=5, I→P=10, P→I=8, P→P=3.
**Assert:** lower_bound includes min transition cost for bb1→bb2 edge = 3 (P→P). Total lower_bound = 0 (stmts) + 3 (edge) = 3.
**Why:** Edge contributions capture unavoidable transfer costs. Without them, BnB under-prunes.

### `lower_bound_skips_self_loop_edges`

**Body:** 2-block SCC where bb0 has a self-loop: bb0 → bb0, bb0 → bb1, bb1 → bb0. Plus bb2 exit.
**Setup:** Neither fixed (depth = 0). bb0 domain = {I, P}. Self-edge TransMatrix: I→P = 100. bb0→bb1 TransMatrix: all = 0. bb1→bb0 TransMatrix: all = 0. Statement costs = 0.
**Assert:** lower_bound = 0. The self-edge cost of 100 must NOT appear in the bound.
**Why:** Self-loop transitions are always same-target (cost 0). Including cross-target pairs from the self-edge inflates the bound with impossible transitions.

### `lower_bound_fixed_successor_uses_concrete_target`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit.
**Setup:** Fix bb0 (depth = 1) and bb2 (in the fixed set, target = P). bb1 unfixed, domain = {I, P}. TransMatrix on bb1→bb2: I→P=10, P→P=5, I→I=1, P→I=2.
**Assert:** The edge bound for bb1→bb2 uses bb2's concrete target P: min(I→P=10, P→P=5) = 5. NOT min over all pairs (which would be I→I=1).
**Why:** When one endpoint is fixed, the bound must use the concrete assignment. Using the full domain cross-product would under-estimate.

### `lower_bound_all_fixed_returns_zero`

**Body:** 2-block SCC: bb0 ↔ bb1, plus bb2 exit.
**Setup:** Fix both (depth = 2, both in fixed set). Statement costs and transition costs are non-zero.
**Assert:** lower_bound = 0. No unfixed blocks or edges means no remaining cost.
**Why:** Base case — when the assignment is complete, the bound must be zero so BnB accepts the solution.

---

## 5. MRV Selection

Tests construct a `ConstraintSatisfaction` and call `mrv` directly.

### `mrv_selects_smallest_domain`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit.
**Setup:** depth = 0. blocks[0] = bb0 domain {I, P, E} (size 3), blocks[1] = bb1 domain {I} (size 1), blocks[2] = bb2 domain {I, P} (size 2).
**Assert:** mrv returns (offset=1, block=bb1) — the block with smallest domain.
**Why:** MRV picks the most constrained variable for early failure detection.

### `mrv_tiebreak_by_constraint_degree`

**Body:** 3-block SCC: bb0 → bb1, bb0 → bb2, bb1 → bb0, bb2 → bb0. Plus bb3 exit from bb0. (bb1 and bb2 both connect to bb0.)
**Setup:** depth = 0. bb0 domain = {I, P} (size 2), bb1 domain = {I, P} (size 2), bb2 domain = {I, P} (size 2). bb0 has 3 neighbors in-SCC (bb1 pred, bb2 pred, bb3 boundary), bb1 has 1 neighbor (bb0), bb2 has 1 neighbor (bb0).
**Assert:** mrv returns bb0 — same domain size as bb1/bb2, but highest constraint degree (most neighbors that are either fixed or boundary).
**Why:** Tie-breaking by constraint degree picks the most constrained variable, which fails faster.

### `mrv_skips_fixed_blocks`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit.
**Setup:** depth = 1. blocks[0] = bb0 (fixed, at position < depth). blocks[1] = bb1 domain {I, P, E} (size 3). blocks[2] = bb2 domain {I, P} (size 2).
**Assert:** mrv returns (offset=1, block=bb2) — only considers blocks at depth 1 and beyond. bb0 is not considered.
**Why:** MRV must only select from unfixed blocks (those at index ≥ depth). Selecting a fixed block would double-assign it.

---

## 6. CSP Greedy Solver

### `greedy_solves_two_block_loop`

**Body:** bb0 → bb1, bb1 → bb0, bb1 → bb2 (exit). (`bb1: if cond then bb0() else bb2()`)
**Setup:** bb0 and bb1 domain = {I, P}. TransMatrix on all edges: I→I=0, P→P=0, I→P=5, P→I=5. Statement costs: bb0 I=8 P=3, bb1 I=8 P=3.
**Assert:** `solve()` returns true. Both blocks assigned P (cheaper statement cost, same-target transition = 0).
**Why:** Simplest cyclic case. Validates MRV → estimate → assign → narrow → advance loop.

### `greedy_rollback_finds_alternative`

**Body:** 3-block SCC: bb0 → bb1 → bb2 → bb0, plus bb3 exit from bb2.
**Setup:** bb0 domain = {I, P}, bb1 domain = {I, P}, bb2 domain = {P}. TransMatrix bb0→bb1: I→I=0, I→P=0, P→I=0, P→P=0. TransMatrix bb1→bb2: only I→P=0 (P→P disallowed). TransMatrix bb2→bb0: P→I=0, P→P=0.
If MRV picks bb2 first (smallest domain, size 1): bb2=P, then narrow. bb1 must have I (from bb1→bb2 constraint). bb0 gets whatever works.
If MRV picks bb0 or bb1 first and picks P: narrowing bb2's already-singleton domain may empty if the transition is wrong, triggering rollback.
**Assert:** `solve()` returns true. bb2 = P. bb1 = I (forced by bb1→bb2 constraint).
**Why:** Tests that rollback correctly unwinds a bad assignment, replays narrowing, and continues.

### `greedy_fails_when_infeasible`

**Body:** bb0 ↔ bb1 loop, plus bb2 exit.
**Setup:** bb0 domain = {I}, bb1 domain = {P}. TransMatrix bb0→bb1: only I→I (no I→P). TransMatrix bb1→bb0: only P→P (no P→I).
**Assert:** `solve()` returns false.
**Why:** No consistent assignment exists. Solver must report failure, not silently produce a broken placement.

---

## 7. CSP Branch-and-Bound

### `bnb_finds_optimal`

**Body:** 3-block SCC: bb0 → bb1, bb0 → bb2, bb1 → bb0, bb2 → bb0. Plus bb3 exit.
**Setup:**

- Statement costs: bb0 I=10 P=2, bb1 I=3 P=3, bb2 I=3 P=3.
- TransMatrix all edges: I→I=0, P→P=0, I→P=0, P→I=25.
- All domains = {I, P}.
- Greedy (MRV) picks bb0 first (most constrained — 4 neighbors), assigns P (cost 2 < 10).
  bb1 and bb2 then pay P→I=25 each if they pick I, or 0 if P. Greedy total with all-P = 2+3+3+0+0 = 8.
  But consider bb0=I: total = 10+3+3+0+0 = 16. So actually all-P is cheaper here.
  Adjust: make transitions asymmetric. P→I=0, I→P=30.
  Now: all-P = 2+3+3+0+0 = 8. bb0=P, bb1=I, bb2=I = 2+3+3+0+0... wait, P→I=0 so still 8.
  Need a case where greedy is suboptimal. Make bb1/bb2 have different costs per target:
- Revised: bb0 I=10 P=2, bb1 I=1 P=50, bb2 I=1 P=50.
  TransMatrix: I→I=0, P→P=0, P→I=20, I→P=20.
  Greedy picks bb0=P (cheapest locally: 2). Then bb1 needs I (cost 1) but P→I=20, so estimate = 1+20=21. Or bb1=P (cost 50+0=50). Greedy picks bb1=I (21 < 50). Same for bb2. Total = 2 + (1+20) + (1+20) = 44.
  Alternative: bb0=I (cost 10). bb1=I (1+0=1). bb2=I (1+0=1). Total = 10+1+1 = 12.
  BnB should find bb0=I with total 12 as optimal.
**Assert:** BnB solution has bb0=I. Total cost ≤ 12.
**Why:** BnB explores the full tree and finds global optima that greedy (which picks locally cheapest at each MRV step) misses.

### `bnb_retains_ranked_solutions`

**Body:** 2-block SCC: bb0 ↔ bb1, plus bb2 exit.
**Setup:** Both domains = {I, P, E}. All transitions allowed at cost 0. Statement costs: bb0 I=5 P=10 E=15, bb1 I=5 P=10 E=15.
Multiple valid assignments exist: (I,I)=10, (P,P)=20, (E,E)=30, plus mixed.
**Assert:** After `solve()`, `region.solutions` is `Some`. At least one alternative in solutions has finite cost (solutions[0].cost < INF, since the best was already consumed by solve).
**Why:** Ranked retention is what makes retry() provide alternatives without re-solving.

### `bnb_pruning_preserves_optimal`

**Body:** 4-block SCC: bb0 → bb1 → bb2 → bb3 → bb0. Plus bb4 exit.
**Setup:**

- All domains = {I, P}.
- Statement costs: all blocks I=1, P=1 (equal).
- TransMatrix: I→I=0, P→P=0, I→P=100, P→I=100.
- Optimal: all-I (cost 4) or all-P (cost 4). Any mixed assignment pays 100+ per crossing.
**Assert:** BnB solution cost = 4. All blocks get the same target.
**Why:** If pruning is too aggressive (bound too tight), it discards the optimal. This test catches that — the lower bound must be ≤ actual cost for the optimal path.

---

## 8. retry()

### `retry_returns_ranked_solutions_in_order`

**Body:** 2-block SCC: bb0 ↔ bb1, plus bb2 exit.
**Setup:** Both domains = {I, P}. Transitions: I→I=0, P→P=0, I→P=5, P→I=5. Statement costs: bb0 I=1 P=2, bb1 I=1 P=2.
Valid assignments: (I,I)=2, (P,P)=4, (I,P)=1+2+5+5=13, (P,I)=2+1+5+5=13.
BnB finds all 3 retained (K=3): first (I,I), then (P,P), then one of the mixed.
**Sequence:** `solve()` applies (I,I). First `retry()` applies (P,P). Second `retry()` applies a mixed solution.
**Assert:** Each retry returns true with a different assignment. Costs are non-decreasing.
**Why:** Primary retry purpose: provide alternatives without re-solving.

### `retry_exhausts_then_perturbs`

**Body:** 2-block SCC: bb0 ↔ bb1, plus bb2 exit.
**Setup:** Both domains = {I, P}. Transitions: only same-target allowed (I→I=0, P→P=0). Statement costs: bb0 I=1 P=2, bb1 I=1 P=2.
Only 2 valid assignments: (I,I) and (P,P). K=3 but only 2 finite solutions exist.
**Sequence:** `solve()` applies (I,I). `retry()` applies (P,P). Next `retry()` — ranked solutions exhausted, falls back to perturbation. Heaps are also exhausted (each block only had 2 targets, both consumed). Returns false.
**Assert:** Third retry returns false.
**Why:** Tests the full lifecycle: ranked → perturbation → exhaustion.

---

## 9. Forward/Backward Pass Integration

### `forward_pass_assigns_all_blocks`

**Body:** Diamond: bb0 → bb1, bb0 → bb2, bb1 → bb3, bb2 → bb3. All trivial SCCs.
**Setup:** All domains = {I, P}. All TransMatrices: I→I=0, P→P=0, I→P=0, P→I=0. Statement costs = 0 everywhere.
**Assert:** After forward pass, every block in `targets` is `Some`.
**Why:** Basic contract — the forward pass must assign every region.

### `backward_pass_improves_suboptimal_forward`

**Body:** Linear chain: bb0 → bb1 → bb2.
**Setup:** bb0 domain = {I}, bb1 domain = {I, P}, bb2 domain = {I}. Statement costs: bb1 I=10, bb1 P=2. TransMatrix bb0→bb1: I→I=0, I→P=0. TransMatrix bb1→bb2: I→I=0, P→I=50.
Forward pass: bb0=I (forced). bb1: estimate with bb2 unassigned — heuristic picks P (stmt cost 2, optimistic successor estimate). bb2=I (forced).
Backward pass: bb1 reconsiders with bb2=I known. bb1=P costs 2+50=52. bb1=I costs 10+0=10. Switches to I.
**Assert:** After backward pass, bb1 = I.
**Why:** Core value of backward pass: correcting suboptimal choices made with incomplete successor context.

### `rewind_backtracks_across_trivial_regions`

**Body:** Chain: bb0 → bb1 → bb2.
**Setup:** bb0 domain = {I, P}, bb1 domain = {I, P}, bb2 domain = {P}. TransMatrix bb0→bb1: all allowed, cost 0. TransMatrix bb1→bb2: only I→P=0 (P→P disallowed).
Forward pass: bb0=I (cheapest). bb1=P (cheapest stmt). At bb2: needs P, but bb1=P and P→P disallowed. bb2 fails → rewind to bb1. bb1 switches to I. I→P=0 works. bb2=P succeeds.
**Assert:** Forward pass succeeds. bb1 = I, bb2 = P.
**Why:** Tests DAG-level rewind: when a downstream region fails, the solver walks back to find a region that can change.

### `rewind_clears_downstream_assignments`

**Body:** Chain: bb0 → bb1 → bb2 → bb3.
**Setup:** bb0 domain = {I, P}, bb1 domain = {I, P}, bb2 domain = {I, P}, bb3 domain = {P}. TransMatrix bb2→bb3: only I→P=0 (P→P disallowed). All other transitions allowed at cost 0.
Forward: bb0=P, bb1=P, bb2=P. At bb3: P→P disallowed, fails. Rewind walks: bb2 exhausted (only had P? no, domain {I,P}). bb2 switches to I. Then bb3 retries with I→P=0, succeeds.
**Assert:** After forward pass, bb2 = I, bb3 = P. bb0 and bb1 retain their original assignments.
**Why:** Rewind must clear assignments for regions between the rewound-to point and the failure, so they get fresh estimates on the next forward iteration.

### `single_block_trivial_region`

**Body:** `bb0: x = load 0; return x`.
**Setup:** bb0 domain = {I, P}. Statement costs: I=10, P=5. No edges (return terminator).
**Assert:** After solve, bb0 = P (cheapest).
**Why:** Simplest case — trivial region doesn't enter CSP. Validates the fast path.

### `cyclic_region_in_forward_backward`

**Body:** bb0 → bb1, bb1 → bb2, bb2 → bb1 (loop), bb2 → bb3 (exit). bb1-bb2 form a 2-block SCC.
**Setup:** bb0 domain = {I}, bb1 domain = {I, P}, bb2 domain = {I, P}, bb3 domain = {I}. TransMatrices: I→I=0, P→P=0, I→P=5, P→I=5. Statement costs: bb1 I=3 P=1, bb2 I=3 P=1.
**Assert:** Forward pass succeeds. The SCC {bb1, bb2} is solved via CSP. bb0=I, bb3=I. The SCC's assignment minimizes internal + boundary cost.
**Why:** Integration test combining trivial regions with a cyclic CSP region in the same forward/backward pass.

---

## Not Tested (with rationale)

- **Condensation construction / Tarjan:** Infrastructure from `hashql-core` with its own test suite. Tested transitively by every integration test that constructs a solver.
- **Arc consistency (AC-3):** Has its own comprehensive test file at `placement/arc/tests.rs`.
- **Cost/ApproxCost arithmetic:** Tested in `cost.rs` with dedicated unit tests.
- **PlacementBlock/Solution struct layout:** Data types, not behavior. Tested through usage in every solver test.
