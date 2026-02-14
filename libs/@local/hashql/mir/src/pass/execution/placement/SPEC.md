# Placement Determination

## Overview

Placement determination is the final phase of the MIR execution planning pipeline. It consumes:

- **Per-block `TargetBitSet`**: which execution targets can handle each basic block (from statement placement + splitting)
- **`TerminatorCostVec`**: per-edge `TransMatrix` encoding valid (source → dest) backend transitions and their transfer costs
- **Per-block-per-target statement costs**: aggregated from `StatementCostVec`

It produces a final `TargetId` assignment for every basic block.

## Preconditions

1. Single-block self-loops are treated as trivial placement regions (see Implementation Notes: Self-Loop Blocks).
2. Feasibility is **not** guaranteed by construction. There is no assumption that an always-available interpreter target exists. When no valid assignment can be found, the algorithm backtracks (see Phase 3a). If all possibilities are exhausted, a diagnostic is emitted.

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

    if targets[u].is_empty():
        emit diagnostic  // no valid assignment exists for this block
```

**Properties:**

- Domains only shrink, so the algorithm terminates.
- Each edge is re-examined at most O(K) times (where K is the number of targets), since each re-enqueue is caused by a domain shrinking, and domains can shrink at most K times.
- Total complexity: O(E · K²) where E is the number of CFG edges — efficient even with many targets.
- An empty domain means no valid assignment exists for that block. This is a hard error — emit a diagnostic.
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

Each super block has a set of **boundary edges** connecting it to the rest of the condensation DAG. A boundary edge records:

- The block inside the SCC that the edge touches.
- The CFG source block of the edge (needed to look up the `TransMatrix`).
- The edge index into `TerminatorCostVec::of(source_block)`.
- The direction: whether the external neighbor is the source (incoming) or the SCC block is the source (outgoing).

```
BoundaryEdge:
    scc_block: BasicBlockId
    source_block: BasicBlockId   // CFG source of the edge
    edge_index: usize            // index into terminators.of(source_block)
    direction: Incoming | Outgoing
```

The boundary edge topology is static per SCC (computed once after Tarjan). What changes between the forward and backward passes is which external neighbors have been assigned targets.

**Boundary context** passed to the CSP solver pairs the static edges with dynamic neighbor assignments:

```
BoundaryContext:
    edges: [BoundaryEdge]
    neighbor_targets: [Option<TargetId>]   // parallel to edges
```

When `neighbor_targets[i]` is `Some(t)`, the CSP:

1. **Narrows the domain** of `edges[i].scc_block` to targets compatible with `t` via the edge's `TransMatrix`.
2. **Includes boundary edge cost** in the objective: looking up `TransMatrix[(t, t_scc)]` for incoming edges, `TransMatrix[(t_scc, t)]` for outgoing edges.

When `neighbor_targets[i]` is `None`, the edge does not constrain the domain or contribute a concrete cost term. The forward pass uses a heuristic (cheapest compatible target of the unassigned successor) for value ordering only.

**Caching:** results are cached keyed by the raw `neighbor_targets` tuple — the sequence of `Option<TargetId>` values for each boundary edge. This is exact: different neighbor assignments that happen to induce the same domain narrowing but different boundary edge costs produce different cache keys, avoiding incorrect cost reuse.

```
SuperBlock:
    blocks: Vec<BasicBlockId>
    boundary_edges: Vec<BoundaryEdge>
    cache: Map<Vec<Option<TargetId>>, CspSolution>

    fn solve(&mut self, neighbor_targets: &[Option<TargetId>], ...) -> CspSolution:
        cache.entry(neighbor_targets).or_insert_with(||
            solve_csp(self.blocks, self.boundary_edges, neighbor_targets, ...)
        )
```

#### CSP Solver (within an SCC)

For a non-trivial SCC with N blocks and K candidate targets per block (post-pruning):

**Variables:** one per block, each assigned a `TargetId`.

**Domains:** pruned `TargetBitSet` per block, further narrowed by assigned boundary neighbors. For each boundary edge with a known neighbor target, the `scc_block`'s domain is intersected with the set of targets reachable via that edge's `TransMatrix`.

**Constraints:** for each internal edge `(u → v)`, `TransMatrix[(source_target, dest_target)]` must be `Some(_)`.

**Objective:** minimize total cost, which includes:

- Sum of block statement costs for all blocks in the SCC.
- Sum of internal edge transition costs.
- Sum of boundary edge transition costs for assigned neighbors: for each boundary edge with a known `neighbor_target`, the transition cost through the edge's `TransMatrix` for the chosen `scc_block` target.

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

        edge_costs = sum of transition costs to/from assigned internal neighbors
                   + sum of boundary edge costs to/from assigned external neighbors
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

#### Forward Pass (MRV ordering with backtracking)

The forward pass processes super blocks using **dynamic MRV ordering**: at each step, pick the unassigned super block whose blocks have the smallest remaining target domains. Break ties by highest constraint degree (most unassigned neighbors / boundary edges).

Each block maintains a **`TargetHeap`**: a sorted list of candidate targets ordered by estimated cost. The heap supports `pop()` to consume the current best and advance to the next candidate.

The forward pass maintains an **assignment stack**: a log of `(super_block, assignment)` entries in the order they were processed. This stack drives backtracking.

```
assignment_stack = []

while unassigned super blocks remain:
    super_block = pick unassigned super block by MRV
        (smallest remaining domain, break ties by constraint degree)

    if trivial (single block, no self-loop):
        heap = estimate_costs(block, assigned_neighbors)
        elem = heap.pop()

        if elem is None:
            backtrack(assignment_stack)  // no valid target — see below
            continue

        assignment[block] = elem.target
        options[block] = heap  // save remaining heap for backtracking
        assignment_stack.push(super_block)

    else (non-trivial SCC):
        fill neighbor_targets from assigned boundary neighbors
        solve CSP with boundary context
        assignment_stack.push(super_block)
```

##### Backtracking

When a super block has no valid target (its `TargetHeap` is exhausted, or CSP finds no solution), the algorithm backtracks:

1. **Trivial super block**: walk back up the assignment stack to find a super block that can change its assignment (its `TargetHeap` has remaining entries). Pop the next target from that heap. Undo all assignments downstream of it (truncate the stack). Resume the forward pass from the new state — MRV will re-evaluate ordering for remaining super blocks, which may produce a different order than the original pass. This is correct and desirable: the constraint landscape has changed.

2. **Non-trivial SCC**: when the CSP fails or a downstream failure propagates back into an SCC, use **least-delta perturbation** to choose which member to change:
   - For each member block in the SCC, peek at its `TargetHeap` to see the next candidate target.
   - Compute the **delta** between the current target and the next target for each member. This delta is intrinsic to the target pair (cost difference), not a speculative evaluation of downstream impact.
   - Pick the member with the **smallest delta** — the one where switching causes the least local disruption.
   - Pop that member's next target and re-solve the SCC's internal CSP with the updated assignment.
   - If the SCC's `TargetHeap`s are all exhausted, propagate the backtrack further up the assignment stack.

```
backtrack(assignment_stack):
    while assignment_stack is not empty:
        super_block = assignment_stack.pop()

        if trivial:
            block = super_block.block
            elem = options[block].pop()

            if elem is Some:
                assignment[block] = elem.target
                // undo all assignments that were made after this point
                // (already removed from stack by the pop loop)
                assignment_stack.push(super_block)
                return  // resume forward pass with MRV re-evaluation

        else (non-trivial SCC):
            // find member with smallest current→next delta
            best_member = None
            best_delta = infinity

            for member in super_block.members:
                if options[member].is_empty():
                    continue

                next = options[member].peek()
                delta = next.cost - current_cost[member]

                if delta < best_delta:
                    best_delta = delta
                    best_member = member

            if best_member is Some:
                options[best_member].pop()
                // re-solve SCC CSP with updated member target
                assignment_stack.push(super_block)
                return  // resume forward pass

    // all possibilities exhausted — no valid placement exists
    emit diagnostic
```

**Termination**: each backtrack step pops from a finite `TargetHeap`. Pops are monotonic (targets are consumed, never re-added). Upward propagation eventually exhausts all heaps or finds a valid assignment.

**MRV on replay**: after backtracking, the forward pass re-evaluates MRV for remaining unassigned super blocks. The ordering may differ from the original pass because domains have changed. This is a feature: MRV adapts to the new constraint landscape after perturbation, making better choices than a stale static order would.

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
        fill neighbor_targets: Some(t) for all boundary edges
            (both predecessors and successors are now assigned)
        re-solve CSP with fully populated boundary context

        Δ = new total cost (internal + boundary) - old total cost

        if Δ < 0:
            update assignment with new CSP solution
```

**Properties:**

- The forward pass uses MRV to process the most constrained super blocks first, catching infeasibility early and reducing backtracking depth.
- Backtracking via TargetHeap pops ensures systematic exploration without revisiting states.
- Least-delta perturbation within SCCs minimizes the blast radius of changes, making it more likely that downstream assignments survive.
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
  Phase 3a: Forward Pass (MRV ordering + backtracking)
        │  (initial assignments via TargetHeap)
        ▼
  Phase 3b: Backward Pass (reverse topological)
        │  (refined assignments)
        ▼
  BasicBlockVec<TargetId>  ← final output
```

## Invariants

1. **Monotonic pruning**: arc consistency only removes targets, never adds. Domains converge.
2. **Monotonic refinement**: each backward pass iteration only switches assignments when total cost strictly decreases. Convergence is guaranteed.
3. **SCC locality**: backtracking is scoped to individual SCCs. The DAG-level refinement uses greedy assignment with local repair, not exponential search.
4. **Edge cost accounting**: internal SCC edges are charged inside the CSP. Boundary edges with assigned neighbors are also charged inside the CSP (via the boundary context). No double-counting: each edge is accounted for exactly once.
5. **Self-loop handling**: single-block self-loops are trivial placement regions. Cost estimation skips self-loop edges (the transition cost is always 0 for same-target self-loops). See Implementation Notes.
6. **Backtracking termination**: TargetHeap pops are monotonic (targets are consumed, never re-added). Upward propagation through the condensation DAG eventually exhausts the search space or finds a solution. The combination of finite heaps and monotonic consumption guarantees termination.

## Implementation Notes

The spec describes the algorithm's intent and correctness properties. The implementation deviates in several deliberate ways for performance and simplicity. This section documents design decisions discovered during implementation review.

### Graph Topology

The implementation uses a single `LinkedGraph` for the condensation, where all CFG edges are stored — including intra-SCC edges as self-edges on the SCC node. The `edge.source() != edge.target()` check distinguishes boundary edges from internal ones. This avoids maintaining a separate boundary-edge list per SCC while still allowing cost estimation to weight internal vs boundary edges differently (via `boundary_multiplier`).

### Self-Loop Blocks

Single-block self-loops are classified as **trivial** placement regions, not cyclic. This is correct because cost estimation skips self-loop edges entirely: a block assigned to target T always self-loops at cost `M[(T, T)] = 0`. Including the self-loop in cost estimation would allow the heuristic to consider cross-target transitions (e.g. A→B) that can never occur on a self-loop, artificially inflating costs for some targets.

### Cost Estimation: Deliberate Double-Counting

Edge transition costs are counted from **both sides**: when estimating a block's target cost, both incoming predecessor edges and outgoing successor edges contribute. This intentionally double-counts edge costs relative to the spec's "charge each edge once" model.

The rationale: at SwitchInt joins, a block may have multiple incoming edges with different transition cost profiles. Counting from both sides gives each edge influence over the block's target choice proportional to how expensive it is. Without control-flow frequency information, this is a reasonable "expected cost" heuristic. The alternative (charge once) would require choosing which side "owns" the edge, losing information.

This means the cost estimation is a **value-ordering heuristic**, not an exact objective. The `HeapElement` stores `ApproxCost` for delta comparisons during backtracking, not for absolute cost accounting.

### CSP: Local Tree Exploration Instead of Branch-and-Bound

The CSP solver uses depth-first backtracking with forward checking (domain narrowing) rather than maintaining an explicit cost bound. Pruning comes from domains emptying during narrowing, not from comparing `cost_so_far + lower_bound >= best_cost`. This saves memory (no need to track the best complete solution or compute per-step lower bounds) and is effective when domains are small post-AC-3 (K ≈ 2–3).

### CSP: Forward Checking Is Bidirectional

After assigning block B to target T, domains are narrowed for **both** successors and predecessors:

- Outgoing edge `(B → N)`: keep `t_n` where `M[(T, t_n)]` exists.
- Incoming edge `(N → B)`: keep `t_n` where `M[(t_n, T)]` exists.

The predecessor direction is essential — without it, the CSP can assign targets to predecessor blocks that have no valid transition to B's chosen target.

### CSP: Rollback Semantics

When backtracking to depth `d` and choosing a new target for block at index `d`:

1. Pop the next element from the block's `TargetHeap`.
2. Set `depth = d + 1` so the changed block is included in the fixed prefix.
3. Replay narrowing: reset domains for all blocks after `depth`, then re-propagate constraints from the entire fixed prefix.

The heap must be persisted into `PlacementBlock.heap` immediately after the first pop during assignment, or rollback has no alternatives to try.

### MRV Tie-Breaking

MRV tie-breaking uses **highest constraint degree** — the number of neighbors that are either already fixed or outside the SCC (boundary neighbors). This picks the most constrained block, which is more likely to fail early and trigger backtracking before wasting work on less constrained blocks.

### CSP Caching

The spec describes caching CSP results keyed by `neighbor_targets`. The implementation omits this: cost estimation already provides partial caching effects through the heap ordering, and the added complexity of maintaining a cache keyed by boundary context tuples is not justified for typical SCC sizes.

### Forward Pass: Fixed Topological Order

The forward pass processes super blocks in the topological order produced by Tarjan, not in dynamic MRV order across regions. MRV is used **within** the CSP (for variable ordering inside an SCC), but region processing order is static. This simplifies the assignment stack and avoids the cost of recomputing region-level MRV after each assignment.

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
