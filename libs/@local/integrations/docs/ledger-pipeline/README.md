# Ledger pipeline: start here

This folder holds the design of the new ingestion pipeline and the handoff for continuing it. Last updated 2026-11-18.

The pipeline takes incremental updates to the Graph in three stages: Capture stores the changed rows, Prepare turns them into entity changes in an append-only sync table, and Send builds the Graph requests from that table. One status file per run, `run.json`, records what each stage completed.

## Where the work stands

- **Design:** the high-level spec is agreed. Six inventory decisions are settled, and several questions are open or deferred to the team.
- **Steps:** all 18 steps are agreed and listed in `steps.md`, with a status table that says which are ready and which are blocked by an open question.
- **Code:** a skeleton crate exists with the module tree, the types and the public functions. Every body is `unimplemented!()`. No stage is implemented.
- **Branch:** `codex/ingestion-pipeline`, not pushed, with no upstream. `main` was merged into it on 2026-11-18.

## What to read, in this order

| File                                                   | What it is                                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [spec.md](spec.md)                                     | The contract: scope, stages, the sync table, `run.json`, stage contracts, crate layout                                                                                      |
| [steps.md](steps.md)                                   | The steps of each stage, one per issue, with a status table: run state (R1 to R5), Capture (C1), row files and the sync table (T1, T2), Prepare (P1 to P6), Send (S1 to S5) |
| [open-issues.md](open-issues.md)                       | Every open question with its options, and what is chosen for now                                                                                                            |
| [inventory/](inventory/)                               | What labs, `engine` and the `pipeline` crate already have, per stage, with tests to port                                                                                    |
| [walkthrough.html](walkthrough.html)                   | One example run as an interactive flow map. Published at <https://claude.ai/artifact/GuMovXgeWEf1gzsGWXYbN8>                                                                |
| [`ledger` crate](../../ledger/src)                     | The skeleton, `hash-integrations-ledger`                                                                                                                                    |
| [RUST_DESIGN_GUIDELINES.md](RUST_DESIGN_GUIDELINES.md) | The rules the crate follows                                                                                                                                                 |

[index.html](index.html) is the older static overview. The walkthrough replaces it, and it has not been kept in step since 2026-11-17.

The team's page is "Integrations Architecture" in Notion. Its numbered open issues overlap with `open-issues.md`. Its pipeline overview text still describes an older design.

## The decisions that shape everything

The spec has the full list. These are the ones a newcomer most needs:

- **Scope:** incremental updates only, apply only, started by hand. Reading source systems belongs to a later data collection service.
- **Capture is data-only.** It uploads the given Parquet files unchanged and adds no column. A file holds the source's rows plus `_change` (`insert`, `update`, `delete`), in the order the changes happened.
- **Prepare owns everything about the pipelines.** Staging adds the internal columns `_op`, `_key` and `_seq`. Staging is the step a later variant such as hash and diff replaces.
- **The sync table** is append-only. A row holds the new value of one change, with `run_id`, `order_id`, `op`, the entity id and type, the link endpoints and the properties.
- **Send** sorts by operation and then `order_id`, cuts deterministic batches, and records the confirmed batch count. A create that gets a conflict counts as done. An update is one `add` per property.
- **`run.json`** is the only status file of a run, with one part per stage, a send progress part and a failure part. `current.json` holds the active run and the last completed run. Runs are strictly sequential.
- **The crate builds on `engine`** and copies none of its modules. The conditional write for the status files goes into `engine`'s storage module.

## What is open

| Question                                     | State                                          | Blocks                                 |
| -------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| How the sync table is stored                 | Open, also on the team's list                  | Prepare's write step, Send's read step |
| Links and joins in incremental runs          | Deferred, team discussion ("Links From Joins") | Every link step                        |
| A bulk request the Graph refuses             | Open, recommendation recorded                  | Send's delivery step                   |
| A write the Graph refuses for good           | Open                                           | Send's delivery step                   |
| How the Graph answers a replayed write       | Partly known from code, needs tests            | Send's delivery step                   |
| A source that cannot tell insert from update | Open, three values chosen for now              | Nothing in the first version           |
| Removing a property                          | Open                                           | Nothing in the first version           |
| The capture row shape                        | Chosen for now, to be agreed in the team       | Nothing in the first version           |

## The plan from here

1. **A cross-check** by a reviewer that has not seen the reasoning: every type that crosses a stage is the same on both sides, every write to S3 has a reader and a rerun rule, and every shared function has one owner.
2. **One issue per step.** Each issue holds the outcome, the function signatures, the flow of types through the step, the files to reuse with the changes they need, the tests to port with their expected values, and the rerun case. The values of the walkthrough example are the shared fixture.
3. **Issues into Linear,** after the team and project are named.
4. **Implementation,** starting with R1, which changes `engine` and depends on nothing.

Thirteen steps are ready to become issues: R1 to R5, C1, T1, P1, P2, P4, S1, S2 and S3. The other five are blocked in part by an open question. The status table in `steps.md` has the details.

## How this work is done

- **Decisions are made one at a time.** Each is presented with what the code does today, what the earlier decisions force, and one recommendation. Only what was decided is written down. A question nobody can decide yet goes to `open-issues.md` with its options and a "chosen for now".
- **Facts come from the code.** Before stating what existing code does, read it. Two statements made from memory in this work were wrong and had to be corrected.
- **Expected values come from labs and `engine` first.** The `pipeline` crate's tests are the second choice.
- **Subagents do the reading.** The inventories were written by three subagents on Opus and spot-checked. Design decisions stay in the main session.
- **Explanations use plain words and a concrete example.** The Ada and Acme example and the A-1 to D-1 example in the walkthrough are the ones in use.

## Things that are easy to trip over

- **`engine`'s storage module is not on `main`.** It comes from the open pull request hashintel/hash#10392. The crate builds only on a branch that has it.
- **The `pipeline` crate is a reference.** It is the previous refactor, it stays unchanged, and nothing depends on it.
- **The walkthrough is published.** After a change to `walkthrough.html`, publish it again to the same link.
- **Checks to run before a commit:**

```bash
yarn oxfmt --check libs/@local/integrations/docs/ledger-pipeline
```

```bash
mise exec --env dev markdownlint-cli2 -- markdownlint-cli2
```

```bash
cargo clippy -p hash-integrations-ledger --all-features --all-targets --no-deps -- -D warnings
```

The Markdown lint reports errors in the older `docs/pipeline/` files. Those are not part of this work.
