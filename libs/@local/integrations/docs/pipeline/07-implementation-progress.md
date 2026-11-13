# Ingestion pipeline implementation progress

## Scope and baseline

- Goal: deliver the replacement ingestion pipeline, required behavioral and seam checks, independent Astra reviews, and an accepted local commit for each milestone. No push, publication, merge, or production caller migration is authorized.
- Agreed spec baseline: `feb96672c5387ebb7615cf161ae842abbf1a9033`.
- Implementation branch: `codex/ingestion-pipeline`.
- Initial worktree: clean. Existing implementation sources are read-only references throughout this work.
- New crate: `hash-integrations-pipeline`, at `libs/@local/integrations/pipeline`.
- Authority: `04-implementation-workflow.md`; shared interfaces and persisted formats in `01-contracts.md` and `shared-run.md`; scenarios in `03-scenarios.md`.

## Ownership and decisions

The main coordinator owns integration, shared APIs, fixture expectations, the combined harness, acceptance, and commits. Each active milestone has a scoped builder and a separate Astra reviewer; neither commits. Later-stage implementation starts only after the previous acceptance commit.

Logical ownership maps to the new crate as follows:

| Responsibility | New crate location |
| --- | --- |
| Shared context, inputs, errors, markers, tables, current state, runner | `src/run/` |
| Capture; hash and diff with `prepare_rows`; plan; send | `src/stage/{capture,diff,plan,send}/` |
| Required storage, source, workspace, and prepared-pipeline adaptations | `src/{storage,sources,workspace,pipeline}/` |
| Graph operations, property resolution, HTTP adapter, test fake | `src/graph/` |
| Local command and workflow integration | New crate binary and `src/orchestration/`; no edits to existing app sources |
| Canonical expected checkpoints and shared scenarios | New crate test fixtures and a single shared run-level test harness |

Reuse public APIs when sufficient. Marker binding, source capture keys/results, workspace export validation, and several planner APIs are private or absent in this checkout; adapt the necessary reference code inside the new crate. Do not widen old-crate visibility. Reference commits in shared-run section 5.1 and labs at `40a8d14` remain read-only.

Use serde field/map adapters for definition name types that lack serde, retaining the contract's actual Rust field types and stored text. Keep staging owned by `prepare_rows`; private legacy source staging methods are not a shared interface. Preserve bounded buffers and blocking IO safeguards, including the rejection writer despite the deferred F7 sketch. Shared lower-frame error classifiers have one owner and are accessible to stage 1; do not duplicate their policy.

Expected fixtures derive from the reviewed scenario rows, fixed UUID vectors, schemas, and request JSON contracts. A test producer cannot generate its own expectations. Equivalent Parquet bytes are not required; schemas, ordered rows, and exact request JSON are.

## Milestone ledger

| Milestone | State | Acceptance evidence |
| --- | --- | --- |
| Spec/baseline checkpoint | Prepared for commit | Clean initial tree; agreed spec SHA recorded; ownership and placement settled; documentation consistency and `git diff --check` |
| Shared foundation | Pending | Standalone shared types/utilities and fixtures; marker publication/reuse; local cross-process and S3 conditional transitions; decimal export boundaries; Rust checks and Astra review |
| Stage 1: Capture | Pending | Apply/adopt/time/empty/retry/error cases and reviewed capture fixtures |
| Stage 2: Hash and diff | Pending | `prepare_rows` then diff; IDs/hashes, reserved inputs, guards, resend, numeric publication; actual stage-1 output |
| Stage 3: Plan writes | Pending | Exact request JSON/order/batches/property removal; actual stage-2 output and fresh-scratch fixture resume |
| Stage 4: Send and commit | Pending | Delivery/fallback/rejection/current authority/takeover/replay; S1–S9 and required HTTP Graph cases |
| Final integration | Pending | Combined verification, same pipeline from both entry points, unchanged existing sources, deferred-findings reconciliation; commit resulting fixes |

## Active assignment

Baseline preparation only. Read-only contract audits were assigned to `baseline_audit`, `capture_rows_contract_audit`, and `diff_plan_send_contract_audit`. The coordinator read overview, contracts, scenarios, shared-run, workflow, review/change findings and historical verification, applicable AGENTS, Rust design guidelines, and Rust/Git skills. Audit agents read all stage specs in full before implementation.

No implementation is accepted, and no runtime check is claimed by this checkpoint. Record the foundation builder's exact base and scope here before dispatch.

## Remaining required verification and blockers

- New crate checks: nextest, doc tests, all-feature/all-target clippy, rustdoc, formatting, and `git diff --check` as appropriate.
- Real MinIO/S3 conditional create/update races and local cross-process conditional updates are foundation requirements. Docker access may require sandbox escalation; no skipped test counts as passing.
- Real Graph HTTP tests must use actual planned bodies and verify replay editions, property removal, bulk atomicity, conflict/not-found statuses, intended actor/read-only behavior, and the D18 long-number observation. Historical store-level probes are insufficient.
- The checkout lacks the newer Graph client and orchestration sources; use the named Git references for in-crate adapters. For real Graph acceptance, use a compatible reference server without modifying existing implementation sources. Keep test data isolated from the development database.
- No unresolved product decision identified during baseline preparation. A missing prerequisite or mandatory failed check keeps its milestone pending.

## Deferred follow-ups

Retain the agreed deferrals in `06-review-findings.md` and overview D1–D18. F1/F2 are mandatory implementation work. F3 requires planned-body HTTP evidence. F4/F5 behavior remains the agreed coverage/archive rule; no silent policy change. F6 global pacing remains explicitly deferred. F7's resource obligation and F8's shared API ownership are addressed during implementation, and their actual evidence must be recorded before final acceptance. Other case-inventory tests are candidates; add those justified by defects or remaining risk.

## Resume procedure

Read this record, Git history, and the current diff. Recover each checkpoint SHA from Git; do not put a commit's own SHA into itself. Confirm current code is tested and reviewed rather than relying on agent summaries. Keep the completion goal active until every mandatory gate and commit is complete.
