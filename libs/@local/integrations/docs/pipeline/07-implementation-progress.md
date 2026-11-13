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
| Spec/baseline checkpoint | Accepted: `da117f9d4e` | Clean initial tree; agreed spec SHA recorded; ownership and placement settled; documentation consistency and staged `git diff --check` passed |
| Shared foundation | Accepted: `295615fa24` | 135/135 nextest tests passed (zero skipped); clippy/rustdoc/doc tests/format/diff checks passed; coordinator inspected logs and frozen diff; Astra approved with no blocking findings |
| Stage 1: Capture | Accepted; commit follows this record | 267/267 combined nextest tests passed, zero skipped; clippy/rustdoc/doc tests/format passed; coordinator fixture seam verified; Astra approved with no blocking findings |
| Stage 2: Hash and diff | Pending | `prepare_rows` then diff; IDs/hashes, reserved inputs, guards, resend, numeric publication; actual stage-1 output |
| Stage 3: Plan writes | Pending | Exact request JSON/order/batches/property removal; actual stage-2 output and fresh-scratch fixture resume |
| Stage 4: Send and commit | Pending | Delivery/fallback/rejection/current authority/takeover/replay; S1–S9 and required HTTP Graph cases |
| Final integration | Pending | Combined verification, same pipeline from both entry points, unchanged existing sources, deferred-findings reconciliation; commit resulting fixes |

## Active assignment

Stage 1 assignment, base `295615fa24b3a42c845ce933327f2e96ddaeb3d3`:

- Builder `capture_builder`: own stage-1 implementation, source adapters and stage-1 behavioral tests inside the new crate. Read the complete capture spec and relevant contracts, review findings, guidelines and Rust skills. Implement apply/adopt, source binding reuse, one capture time, valid empty output, retry/publication/error rules, and workspace lifecycle. Shared API changes require coordinator agreement; no later-stage implementation or edits to existing crates.
- Coordinator: retain shared API, fixture and acceptance ownership; inspect actual output against independent expected source rows. Required tests cover real capture with source reads, retries and winning markers, empty/adopted outputs, invalid decimal before publication, and specific error classification. Existing valuable regressions remain.
- Independent reviewer `foundation_review` (Astra), reused after builder verification: review actual diff against this base, challenge mandatory behavior and seam coverage, run targeted checks, and verify any fixes. No edits or commits.
- Gate: targeted behavioral/seam tests plus the combined crate suite, all-feature/all-target clippy, rustdoc/doc tests, formatting and diff checks; no unresolved blocking review finding; commit before stage 2 starts.

### Capture acceptance evidence

- Coordinator added `src/run/tests/capture.rs`, comparing actual D0 capture to independent expected schemas and ordered rows after deleting producer scratch. The consumer uses a fresh workspace and replays the durable capture marker. Its targeted `cargo test --package hash-integrations-pipeline --lib run::tests::capture::capture_matches_independent_checkpoint_on_fresh_scratch -- --exact` passed (one test). The full frozen candidate remains to be verified/reviewed.
- Builder's initial 15 focused capture tests passed. They cover marker precedence/races, capture-time ordering, variables/checkpoint omission, valid empty schema, partial retry reuse, local reuse, adoption/empty restore, malformed input, missing credentials and multi-batch/nested numeric failure before publication. Log: `/tmp/pipeline-capture-stage-tests.log`.
- Shared API decisions: add the five stage-1 `Code` variants and extract `artifact_code` beside existing `capture_code`/`statement_code`, preserving a single classification policy. Numeric invalidity takes precedence through wrapper frames. No workspace interface change. Stage-2-rows sections 4.2/5 supersede the older stage-1 staging sketch: source readers expose capture only; `prepare_rows` owns loading/staging, and copied source regressions call workspace staging explicitly.
- Combined `cargo nextest run -p hash-integrations-pipeline --all-features`: **267/267 passed, zero skipped** (18.983 s), including real PostgreSQL capture and MinIO tests. Coordinator inspected `/tmp/pipeline-capture-nextest.log` and the actual adapted source diff. The initial copied PostgreSQL test fixture selected IPv6 for a mapped IPv4 port; its host resolution now explicitly selects IPv4, without changing production destination policy, and both targeted and combined checks passed.
- All-feature/all-target/no-deps clippy passed with zero crate warnings; rustdoc and doc tests (zero examples) passed. Coordinator inspected `/tmp/pipeline-capture-{clippy-final,doc,doctest}.log`. Existing implementation sources remain unchanged against `feb96672c5`. Review acceptance remains pending.
- Frozen rerun `/tmp/pipeline-capture-nextest-final.log`: **267 passed, zero skipped** (20.495 s), with one nextest `LEAK` output-handle flag on the canonical capture seam. The earlier combined run and targeted `/tmp/pipeline-capture-seam-recheck.log` were clean. Both producer and consumer explicitly close workspaces; no subprocess is launched by that seam. This observation is assigned to Astra review before acceptance, not silently discarded. Formatting and staged diff checks passed; staged source diff SHA-256 excluding this record is `c7c526c03db689d20ffb0a4fda43b80c510ea79a31e766111b3e96a6a0a1354f`.
- Leak investigation: `cargo nextest` resolves the repository's mise-pinned **0.9.137**, while `/Users/pauletscheit/.cargo/bin/cargo-nextest` is **0.9.151**. The [official 0.9.145 changelog](https://nexte.st/changelog/) fixes Apple sibling-test capture-pipe inheritance causing false leaked-handle reports. Ten targeted stress iterations passed cleanly (`/tmp/pipeline-capture-seam-stress.log`); the exact frozen full suite under the already-installed 0.9.151 passed **267/267, zero skipped, no leak flags** (19.412 s; `/tmp/pipeline-capture-nextest-0.9.151.log`). No repository tool pin, leak timeout, or candidate code changed. Astra inspected the close paths and treated the isolated flag as a nonblocking runner observation; the earlier flagged result remains recorded.
- Astra approved the actual staged candidate against `295615fa24` with no blocking findings or required changes, independently rerunning 15 stage tests and three source-adapter tests. Coordinator verified the unchanged source hash, clean working-versus-staged implementation, check logs, independent fixture seam, and original-source preservation. Capture is accepted; no stage-2 implementation preceded this acceptance checkpoint.

Baseline preparation only. Read-only contract audits were assigned to `baseline_audit`, `capture_rows_contract_audit`, and `diff_plan_send_contract_audit`. The coordinator read overview, contracts, scenarios, shared-run, workflow, review/change findings and historical verification, applicable AGENTS, Rust design guidelines, and Rust/Git skills. Audit agents read all stage specs in full before implementation.

Foundation assignment, base `da117f9d4e`:

- Builder `foundation_builder`: own new crate production code, its foundation tests, crate/build metadata and required Cargo lockfile updates. Implement shared-run foundations, storage/workspace adaptations and all four stored output types, with no future stage function placeholders. Preserve applicable copied regression tests. Establish executable canonical fixtures with the coordinator's independent expected data. Do not implement stages, local CLI, or workflow runner yet; declare only shared types/interfaces needed now.
- Coordinator: own expected-fixture data and combined harness decisions; approve shared APIs centrally; inspect actual diff and run acceptance checks. May prepare real-service test infrastructure independently of stage implementation.
- Foundation subassignments: `foundation_builder/storage_foundation` owns storage/CAS; `baseline_audit` owns independent fixture data and `src/run/tests/fixtures.rs`; coordinator implemented shared numeric export validation in workspace/capture and `tests/decimal_export.rs`. These are disjoint pieces of the same foundation milestone.
- Independent reviewer `foundation_review` (Astra): after build/test evidence, review the actual diff against the baseline, challenge missing behavioral/resource/seam coverage, verify fixes, and report blocking findings separately. No edits or commits.
- Acceptance: marker winning/reuse including equivalent tables; `start` input stability; current-state authority and bounded CAS; separate-process local create/update races and real MinIO conditional transitions; valid/invalid/unsigned/nested decimal export before publication; bounded RowFile and valid empty schemas; independently executable expected fixtures; nextest, doc tests, all-feature/all-target clippy, rustdoc, formatting and diff checks. No skipped required test satisfies this gate.

The shared foundation and Capture are accepted. Later implementation milestones remain pending.

### Foundation acceptance evidence

- Builder's frozen review candidate: `cargo nextest run -p hash-integrations-pipeline --all-features`, **135/135 passed, zero skipped**, seven test binaries (15.650 s). Includes local/MinIO current-state transitions, deterministic eight-conflict bound, separate-process races/crash recovery, fixture seams and copied regressions. Logs: `/tmp/pipeline-foundation-nextest-final.log`.
- `cargo clippy -p hash-integrations-pipeline --all-features --all-targets --no-deps` passed with zero crate warnings; only three existing root unused-workspace-dependency warnings. `cargo doc -p hash-integrations-pipeline --all-features --no-deps`, `cargo test -p hash-integrations-pipeline --doc --all-features` (zero examples), `cargo fmt -p hash-integrations-pipeline --check`, and `git diff --check` passed. Supporting logs: `/tmp/pipeline-foundation-{clippy-final,doc,doctest}.log`. The coordinator inspected these logs and confirmed the working implementation matches the frozen staged candidate.
- `/Users/pauletscheit/.cargo/bin/cargo test --package hash-integrations-pipeline --test decimal_export`: **14 passed**, zero failed/ignored. Covers signed bounds and null, invalid extrema after 70,000 valid rows, retry classification and partial-file cleanup, nested invalid decimals, nested unsigned types and valid explicit casts.
- Independent Astra review approved the actual diff against `da117f9d4e` with no blocking findings or required fixes. Reviewer reran 14 run/state/marker/table/fixture tests; storage subreviewer reran five process-race/crash/token tests, all passing. Review independently checked fixture ordering/counts and exact 782/797-byte request bodies. The coordinator inspected shared contracts and numeric code, all acceptance logs, and the staged source diff (`86d98f0da44dbe5591b5434b4d744f0a892796b230f1df8c1b16e95b3a4a0584`, SHA-256 excluding this progress document). Stage publication, sender replay, reserved-accessor preparation and real Graph HTTP behavior remain explicitly assigned to subsequent gates.
- Independent expected-data checks passed: JSON/schema row shapes, Python UUIDv5 verification against literal scenario IDs, sorted compact request strings/root replacement, spec-pinned body lengths 782/797 bytes, scenario ordering/count totals, exact copies of external vectors. These are fixture checks, not producer correctness evidence.
- Docker inspection succeeded with sandbox escalation. Existing local Postgres/MinIO are available. An isolated acceptance Graph is now healthy at `http://127.0.0.1:55031`, container `pipeline-acceptance-graph-01a1d65f`, image `sha256:0916afc039032558037e789cd93cc1c5ced0743f4c44295b452ce5806ef690a2` (revision `94fd0baab9c5057fceb42270c98cd575e3eb22cf`). Its dedicated database `pipeline_acceptance_01a1d65f` was created and migrated successfully on local Postgres (`127.0.0.1:5432`, test user/password `postgres`); its test-only service credential is `pipeline-acceptance-only`. Temporal workflows and external embedding calls are disabled. The required Kratos URL is `http://hash-kratos-1:4433`. Healthcheck passed. This is infrastructure evidence only; planned-body HTTP acceptance remains pending. Clean up this task-owned container/database after final verification; never use the development `graph` database for these tests.
- Existing engine, definition and application source trees still match the agreed baseline (`git diff --exit-code feb96672c5 -- libs/@local/integrations/engine libs/@local/integrations/definition apps/hash-integrations`).

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
