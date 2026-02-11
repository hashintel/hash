# Placement Determination

## Overview

Placement determination is the final phase of the MIR execution planning pipeline. It consumes:

- **Per-block `TargetBitSet`**: which execution targets can handle each basic block (from statement placement + splitting)
- **`TerminatorCostVec`**: per-edge `TransMatrix` encoding valid (source → dest) backend transitions and their transfer costs
- **Per-block-per-target statement costs**: aggregated from `StatementCostVec`

It produces a final `TargetId` assignment for every basic block.

## Preconditions

1. The Interpreter target is present in every block's `TargetBitSet`, including empty blocks.
2. For every edge matrix `M`, `M[(Interpreter, Interpreter)] = Some(Cost(0))`.
3. These two properties guarantee that a feasible assignment always exists.
4. Single-block self-loops are treated as non-trivial SCCs (consistent with terminator placement's `is_in_loop` when `successor_id == block_id`).

## Cost Model

All cost comparisons use the **total objective** over the affected cut:

- **Block cost**: sum of per-statement costs for the assigned target.
- **Edge cost**: `TransMatrix[(source_target, dest_target)]` for each CFG edge. Edge costs are charged exactly once — internal SCC edges inside the CSP, boundary edges at the DAG level.

When evaluating a target change (in the backward pass or CSP), compute the **delta** over all affected terms:

```
Δ = (block_cost[b][t'] - block_cost[b][t])
  + Σ incoming edges: (M[(t_pred, t')] - M[(t_pred, t)])
  + Σ outgoing edges: (M[(t', t_succ)] - M[(t, t_succ)])
```

Apply only if `Δ < 0` (strict). Ties prefer the current assignment for stability.

## Algorithm

The algorithm has three phases:

1. **Arc consistency pruning** (fixpoint)
2. **SCC decomposition + internal CSP solving**
3. **Two-pass DAG refinement** (forward + backward)

### Phase 1: Arc Consistency Pruning (AC-3)

Enforce arc consistency using the AC-3 algorithm. Each CFG edge `(u → v)` is a directed binary constraint: `TransMatrix_edge[(t_u, t_v)].is_some()`.

A work queue of edges is seeded with all CFG edges. For each edge, remove unsupported targets from the endpoint domains. When a block's domain shrinks, re-enqueue all other edges incident to that block.

```
queue = all CFG edges (both directions: (u, v) and (v, u) as separate constraints)

while queue is not empty:
    (u, v, M) = queue.pop()

    // revise u's domain: remove targets with no support in v
    for target_u in targets[u]:
        if no target_v in targets[v] where M[(target_u, target_v)].is_some():
            targets[u].remove(target_u)

            // u's domain changed: re-enqueue all other edges incident to u
            for each edge (w, u) or (u, w) where w != v:
                queue.push(edge)

    // safety net: should never trigger due to Interpreter guarantee
    if targets[u].is_empty():
        emit diagnostic
        targets[u].insert(Interpreter)
```

**Properties:**

- Domains only shrink, so the algorithm terminates.
- Each edge is re-examined at most O(K) times (where K is the number of targets), since each re-enqueue is caused by a domain shrinking, and domains can shrink at most K times.
- Total complexity: O(E · K²) where E is the number of CFG edges — efficient even with many targets.
- The Interpreter guarantee means domains should never empty — the diagnostic is a safety net. In debug builds, treat empty domains as hard internal errors.
- After pruning, every surviving target in a block has at least one valid transition partner across each incident edge (but not necessarily the _assigned_ partner).
- Unreachable blocks (not reachable from entry) are still pruned but diagnostics for empty domains on unreachable blocks should be suppressed or downgraded.

### Phase 2: SCC Decomposition + Internal CSP

Compute strongly connected components using Tarjan (already available from terminator placement). Tarjan produces SCCs in reverse topological order.

Each SCC becomes a **super block** in the condensation DAG:

- **Trivial SCC** (single block, no self-loop): candidates are its `TargetBitSet`, cost is `block_cost[target][block]`.
- **Non-trivial SCC** (loop, including single-block self-loops): solved internally via a CSP. The super block's interface is defined by its boundary blocks:
  - **Entry blocks**: blocks with incoming edges from outside the SCC.
  - **Exit blocks**: blocks with outgoing edges to outside the SCC.

#### Super Block Interface

The super block is parameterized by **fixed edges** (constraints from assigned neighbors outside the SCC) and **free edges** (internal edges resolved by the CSP). The exit block targets are _outputs_ of the CSP, not inputs.

In the forward pass, entry block domains are narrowed by assigned predecessors. In the backward pass, both entry and exit block domains are narrowed by assigned predecessors and successors respectively.

```
SuperBlock:
    blocks: Vec<BasicBlockId>
    cache: Map<BoundaryDomains, (Cost, InternalAssignment)>

    fn evaluate(&mut self, boundary_domains: BoundaryDomains) -> (Cost, InternalAssignment):
        cache.entry(boundary_domains).or_insert_with(||
            solve_csp(self.blocks, boundary_domains, ...)
        )
```

The cache is keyed by the induced per-boundary-block domain bitsets (intersection of constraints from assigned neighbors), not raw predecessor target tuples. This canonicalizes equivalent configurations.

#### CSP Solver (within an SCC)

For a non-trivial SCC with N blocks and K candidate targets per block (post-pruning):

**Variables:** one per block, each assigned a `TargetId`.

**Domains:** pruned `TargetBitSet` per block, further narrowed by fixed boundary edges.

**Constraints:** for each internal edge `(u → v)`, `TransMatrix[(source_target, dest_target)]` must be `Some(_)`.

**Objective:** minimize total cost, which includes:

- Sum of block statement costs for all blocks in the SCC.
- Sum of internal edge transition costs.
- Sum of boundary edge transition costs for fixed neighbors (incoming edges from assigned predecessors, outgoing edges to assigned successors when available in backward pass).

**Algorithm:** backtracking search with:

1. **Variable ordering**: Minimum Remaining Values (MRV) — pick the unassigned block with the smallest remaining domain. Break ties by highest constraint degree (most constrained neighbors / boundary edges). For reducible SCCs with an identifiable natural loop header, seed MRV tie-breaking with "header first".
2. **Value ordering**: cheapest target first (by block statement cost + boundary edge costs to fixed neighbors). Finds a good solution early, tightening the branch-and-bound bound.
3. **Forward checking**: after assigning block B to target T, for each unassigned neighbor N connected by edge E, remove incompatible targets from N's domain respecting edge direction:
   - Outgoing edge `(B → N)`: keep `t_n` where `M_E[(T, t_n)]` is `Some`.
   - Incoming edge `(N → B)`: keep `t_n` where `M_E[(t_n, T)]` is `Some`.
   - If any domain empties, backtrack immediately.
4. **Branch and bound**: maintain the best complete solution found so far. Compute a lower bound on remaining cost and prune if `cost_so_far + lower_bound >= best_cost`. The lower bound includes both block and edge contributions:
   - Per unassigned block: minimum statement cost over remaining domain.
   - Per unassigned edge (at least one endpoint unassigned): minimum valid transition cost over compatible domain pairs.
   This captures the unavoidable edge transfer costs that the block-only bound misses.

```
search(depth, assignment, domains, cost_so_far, best):
    if depth == N:
        update best if cost_so_far < best.cost
        return

    block = pick unassigned block with smallest domain (MRV)

    for target in domains[block], cheapest first:
        if any assigned neighbor n has incompatible transition:
            continue

        snapshot domains
        for each unassigned neighbor n of block:
            remove incompatible targets from domains[n] (respecting edge direction)
            if domains[n] is empty:
                restore snapshot
                continue to next target

        edge_costs = sum of transition costs to/from assigned neighbors
                   + sum of boundary edge costs to/from fixed external neighbors
        lower_bound = sum of cheapest target per remaining unassigned block
                    + sum of min valid transition cost per unassigned edge
        if best.is_some() and cost_so_far + block_cost + edge_costs + lower_bound >= best.cost:
            restore snapshot
            continue

        assignment[block] = target
        search(depth + 1, assignment, domains,
               cost_so_far + block_cost + edge_costs, best)
        restore snapshot
        assignment[block] = None
```

**Complexity:** O(K^N) worst case, but with K ≈ 2–3 after pruning and N small (typical loop bodies), this is fast. Forward checking and branch-and-bound prune aggressively.

### Phase 3: Two-Pass DAG Refinement

Operates on the condensation DAG of super blocks.

#### Forward Pass (topological order, sources first)

For each super block, assign targets considering only already-assigned predecessors. Use a heuristic for unassigned successors (assume each picks its cheapest target).

```
for super_block in topological_order:
    if trivial:
        best_target = None
        best_cost = infinity

        for target in targets[block]:
            if any assigned predecessor p has incompatible transition:
                continue

            cost = block_cost[target][block]
                 + Σ transition costs from assigned predecessors
                 + Σ estimated transition costs to unassigned successors
                     (assume each successor picks its cheapest target)

            if cost < best_cost:
                best_cost = cost
                best_target = target

        assignment[block] = best_target
    else:
        narrow entry block domains based on assigned predecessors
        solve CSP (boundary edge costs to predecessors included in objective)
        exit targets determined by CSP solution
```

#### Backward Pass (reverse topological order, sinks first)

All super blocks now assigned. Revisit each, considering actual assignments of _all_ neighbors (predecessors and successors). Switch only if total cost strictly decreases.

```
for super_block in reverse_topological_order:
    if trivial:
        for target in targets[block]:
            if target == current_assignment:
                continue

            if any neighbor n has incompatible transition:
                continue

            Δ = (block_cost[target] - block_cost[current])
              + Σ incoming: (M[(t_pred, target)] - M[(t_pred, current)])
              + Σ outgoing: (M[(target, t_succ)] - M[(current, t_succ)])

            if Δ < 0:
                assignment[block] = target
                current = target
    else:
        narrow entry domains based on assigned predecessors
        narrow exit domains based on assigned successors
        re-solve CSP with both ends constrained

        Δ = (new_internal_cost - old_internal_cost)
          + Δ on all boundary edges (based on entry/exit target changes)

        if Δ < 0:
            update assignment with new CSP solution
```

**Properties:**

- The backward pass sees successor assignments that the forward pass couldn't, allowing it to correct suboptimal choices at join points.
- Arc consistency pruning guarantees that targets surviving in a block's domain are structurally compatible — the backward pass only checks against concrete assignments.
- Strict `Δ < 0` switching with "prefer current on ties" prevents oscillation: total cost monotonically decreases and is bounded below, so iterative forward-backward converges.
- A single backward pass catches most suboptimality. For stronger convergence, iterate forward-backward until no assignment changes.

## Data Flow

```
StatementCostVec ──┐
TargetBitSet ──────┤
TransMatrix ───────┘
        │
        ▼
  Phase 1: Arc Consistency Pruning
        │  (narrowed TargetBitSets)
        ▼
  Phase 2: SCC Decomposition (Tarjan)
        │  (condensation DAG of super blocks)
        ▼
  Phase 3a: Forward Pass (topological)
        │  (initial assignments)
        ▼
  Phase 3b: Backward Pass (reverse topological)
        │  (refined assignments)
        ▼
  BasicBlockVec<TargetId>  ← final output
```

## Invariants

1. **Interpreter fallback**: every block's domain always contains `Interpreter`. Every edge has a valid `Interpreter → Interpreter` transition with zero cost. This guarantees feasibility at every stage.
2. **Monotonic pruning**: arc consistency only removes targets, never adds. Domains converge.
3. **Monotonic refinement**: each backward pass iteration only switches assignments when total cost strictly decreases. Convergence is guaranteed.
4. **SCC locality**: backtracking is scoped to individual SCCs. The DAG-level refinement uses greedy assignment with local repair, not exponential search.
5. **Edge cost accounting**: internal SCC edges are charged inside the CSP. Boundary edges are charged at the DAG level. No double-counting.
6. **Self-loop handling**: single-block self-loops are non-trivial SCCs and go through the CSP path, consistent with terminator placement's loop detection.

## Future Enhancements

### Fixpoint Forward-Backward Iteration

The initial implementation uses a single forward pass followed by a single backward pass. For stronger convergence, wrap both passes in a fixpoint loop:

```
loop:
    improved = false

    for super_block in topological_order:
        if try_improve(super_block):  // same Δ < 0 logic
            improved = true

    for super_block in reverse_topological_order:
        if try_improve(super_block):
            improved = true

    if not improved:
        break
```

After the first iteration, the forward pass is no longer greedy with heuristic successor estimates — successors are assigned from the previous iteration. Both passes become symmetric, each propagating improvements in its traversal direction (forward: source-to-sink, backward: sink-to-source).

**Termination:** each switch strictly decreases total cost. Cost is bounded below. Finite cost values + strict decrease = finite iterations.

**When to add:** a single backward pass catches most suboptimality. The fixpoint loop only helps when a backward-pass change makes an upstream block's earlier choice suboptimal — a chain reaction across three or more blocks. Add this if profiling shows the single backward pass leaves measurable cost on the table, particularly as the number of backends grows.
