# Ledger pipeline: implementation spec

What whoever builds a milestone needs: signatures, pseudo code, the existing code to port, and the tests. The design and its reasons are in `../plan.md`, and this folder points there and does not repeat it.

## The files

| File                 | Job                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `README.md`          | This page: the files, the form of a milestone, and where the work stands                                       |
| `contracts.md`       | The types and functions that one milestone calls from another                                                  |
| `decisions.md`       | Decisions that cross milestones: those waiting for Paul, and those decided                                     |
| `dependencies.md`    | The crates each milestone adds                                                                                 |
| `01-…md` to `11-…md` | One file per milestone of `../plan.md`, step 6                                                                 |
| `sizes.py`           | Recomputes the table below from the source tables of the milestone files, and fails if a number does not match |

## Where the work stands

Lines are source lines without tests, with doc comments and blank lines. Moved and adapted lines are measured from the source, new lines are estimates.

| #   | File                              | State                       | Total     | Moved     | Adapted   | New       | Reused  |
| --- | --------------------------------- | --------------------------- | --------- | --------- | --------- | --------- | ------- |
| 1   | `01-crate-and-storage.md`         | agreed                      | 1,071     | 51        | 237       | 783       | 27%     |
| 2   | `02-run-state.md`                 | agreed                      | 425       | 0         | 0         | 425       | 0%      |
| 3   | `03-stage-frame-and-capture.md`   | agreed                      | 275       | 0         | 0         | 275       | 0%      |
| 4   | `04-sync-table.md`                | waiting for Paul            | 342       | 0         | 35        | 307       | 10%     |
| 5   | `05-workspace.md`                 | agreed                      | 690       | 298       | 389       | 3         | 100%    |
| 6   | `06-sql-steps.md`                 | agreed                      | 328       | 63        | 265       | 0         | 100%    |
| 7   | `07-ids-and-properties.md`        | agreed                      | 705       | 681       | 20        | 4         | 99%     |
| 8   | `08-prepare-incremental.md`       | agreed                      | 750       | 0         | 370       | 380       | 49%     |
| 9   | `09-graph-requests-and-client.md` | agreed                      | 371       | 72        | 240       | 59        | 84%     |
| 10  | `10-send.md`                      | waiting for Fedor's changes | 440       | 0         | 40        | 400       | 9%      |
| 11  | `11-whole-pipeline.md`            | agreed                      | 260       | 0         | 20        | 240       | 8%      |
|     | **All**                           |                             | **5,657** | **1,165** | **1,616** | **2,876** | **49%** |

The numbers of every milestone come from its source table. This table replaces the estimate in `../plan.md`, step 6.

Batches: milestones 1 to 4, then 5 to 8, then 9 to 11. After each batch a check compares it with `contracts.md` and the plan, and Paul reviews it. Batch 1 was checked on 2026-11-19, its findings are applied, and Paul agreed to it. Batch 2 and batch 3 were checked on 2026-11-19 and their findings are applied. A final check over the whole spec ran on 2026-11-19, and its findings are applied too. Paul agreed to nine of the eleven milestones on 2026-11-19. Milestone 4, the sync table, has Fedor's changes: it is a Delta table (D17), and it waits for Paul. Milestone 10, Send, waits for changes by Fedor before Paul agrees to it. On 2026-11-26 Fedor changed milestones 1, 3, 4 and 8: the stages pass their data as Delta tables through DuckDB (D18), and a run is written to a table once (D19).

## Rules for every milestone

- **One pull request per milestone,** with its three numbers: moved, adapted, new.
- **Moved code is committed first, as it was copied,** with its tests. The changes come in a second commit, so a reviewer reads them as a diff.
- **Code whose caller comes later** is declared with `#[cfg_attr(not(test), expect(dead_code, reason = "…"))]` on its module. The milestone that adds the first caller removes the line, and marks what is still unused then. Without it, a build without tests warns about unused code. The first callers: storage (1) is called by 2, run state (2) by 3, the sync table (4) by 8, the workspace (5) by 6, the SQL steps (6) and ids and properties (7) by 8, the requests and client (9) by 10.
- **The four public functions are re-exported from `lib.rs` by the milestone that adds them:** `start` by 2, `capture` by 3, `prepare_incremental` by 8, `send` by 10. They are the crate's public interface, so they need no mark.
- **Module files are created by the first milestone that needs them.** `stage/mod.rs` by 3, `stage/prepare/mod.rs` by 5 or 7, whichever comes first, `stage/send/mod.rs` by 9. A later milestone adds its `mod` line.
- **Shared test fixtures live in one test-only module, `testing.rs`:** the MinIO bucket (added by 1), a helper that writes a Parquet file from rows (3), and the small HTTP server that stands for the Graph (9). Milestones 4, 5, 8, 10 and 11 use them. Tests that need them are inside the crate, because a test in `tests/` cannot reach them.
- **Tests:** existing tests move unchanged with their code. New code gets a few tests of what it promises, not a test per helper.

## The form of a milestone

Every milestone file has the same parts, in this order:

1. **What it adds,** and where it sits in the flow.
2. **Size:** moved, adapted and new lines.
3. **Interface:** what other milestones call. The signatures are in `contracts.md`.
4. **Pseudo code** of each function that carries logic.
5. **Source table:** one row per function or type, with the existing code it comes from.
6. **Tests:** the existing tests that move with the code, and the few new tests of core behaviour.
7. **What was stripped,** with the lines it saves.
8. **Open points,** each sorted as one of three kinds.

## How to read it

- **Moved:** copied with only paths, imports and visibility changed.
- **Adapted:** existing logic with real changes.
- **New:** no counterpart in `engine`.
- **Fact:** checked in code or by a test, with the place.
- **Chosen:** a choice that stays inside one milestone and is cheap to change.
- **D1, D2, ...:** a decision that crosses milestones, in `decisions.md`.
- `engine/` is `libs/@local/integrations/engine/src/`. `labs/` is `labs/pocs/integrations_rs/src/`.
