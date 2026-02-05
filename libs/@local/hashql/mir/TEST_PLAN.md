# Terminator Placement Test Plan

## Scope

- Validate transition rules encoded in `PopulateEdgeMatrix` and enforced by `TransMatrix`.
- Verify per-edge matrix sizing/indexing via `TerminatorCostVec`.
- Ensure transfer cost computation uses liveness and block parameters, including the `Cost::MAX`
  fallback for unbounded sizes.

## Test Cases

| Test name | Purpose | Primary verification |
| --- | --- | --- |
| `terminator_cost_vec_successor_counts` | Ensure successor edge counts match terminator kinds (Goto/GraphRead = 1, SwitchInt = N, Return/Unreachable = 0). | Build a body containing one block per terminator kind, call `TerminatorCostVec::new`, and assert `costs.of(bb).len()` matches expected edge counts. |
| `goto_allows_cross_backend_non_postgres` | Verify Goto edges allow cross-backend transitions for non-Postgres targets. | Run `TerminatorPlacement` on a Goto from `{Interpreter, Embedding}` to `{Interpreter, Embedding}` and assert `matrix.get(Interpreter, Embedding)` equals the computed transfer cost. |
| `switchint_blocks_cross_backend` | Ensure SwitchInt edges disallow cross-backend transitions (except Interpreter fallback). | Run `TerminatorPlacement` on a SwitchInt with `{Interpreter, Embedding}` targets and assert `matrix.get(Interpreter, Embedding)` is `None` while `matrix.get(Embedding, Interpreter)` is `Some(cost)`. |
| `switchint_edge_targets_are_branch_specific` | Confirm each SwitchInt successor edge uses that branch’s target set (partial evaluation). | Use a SwitchInt with two successors where one supports `{Interpreter}` and the other `{Embedding}`; assert the corresponding matrices only contain transitions into their respective targets. |
| `graphread_interpreter_only` | Enforce GraphRead rule: Interpreter → Interpreter only. | Build a GraphRead terminator with all targets enabled; assert the matrix has only `Interpreter -> Interpreter` set and all other entries are `None`. |
| `postgres_incoming_removed` | Ensure transitions into Postgres from other backends are always removed. | Use a Goto edge with destination targets including Postgres; assert `Interpreter -> Postgres` and `Embedding -> Postgres` are `None`, while `Postgres -> Postgres` remains. |
| `postgres_removed_in_loops` | Verify loop SCCs disable all Postgres transitions. | Create a two-block cycle where both blocks support Postgres; assert `Postgres -> Postgres` and `Postgres -> Interpreter` are `None` on loop edges, while `Interpreter -> Interpreter` remains. |
| `transfer_cost_counts_live_and_params` | Ensure transfer cost includes live-in locals plus successor block parameters. | Build a Goto where the successor uses a non-param local and has a block param; with scalar footprints, assert `Postgres -> Interpreter` cost equals the sum of those locals. |
| `transfer_cost_is_max_for_unbounded` | Validate unbounded size estimates yield `Cost::MAX`. | Mark a required local with `Footprint::full()` and assert any transition that needs it has `Cost::MAX`. |

## Notes

- Place unit tests in `src/pass/execution/terminator_placement/tests.rs` and add `#[cfg(test)] mod tests;` to the module.
- Reuse the `body!` macro for Goto/SwitchInt bodies; use `BodyBuilder` for GraphRead terminators (as in existing Postgres statement placement tests).
- Build `TargetBitSet` values using `FiniteBitSet::new_empty(TargetId::VARIANT_COUNT as u32)` for clarity, mirroring execution splitting tests.
