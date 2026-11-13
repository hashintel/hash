# Implementing the pipeline from the specs

Keep stage and step contracts fixed. Use the private implementation sketches as orientation, and simplify them where concrete Rust makes the behavior easier to follow. Start with high-value tests of the pipeline's behavior and seams; expand coverage when a defect, a risk or a later requirement justifies it.

Implementation proceeds sequentially: **shared foundation → capture → hash and diff → plan → send and commit → final integration verification**. One main coordinator manages builder and reviewer subagents. Each milestone follows **build → test → independent review → fix → accept → Git commit** before implementation of the next milestone starts. Git commits here are development checkpoints, distinct from the pipeline's runtime commit to `current.json`.

This workflow applies to `shared-run.md` and all six stage specs. It supersedes instructions in those files to reproduce every private function, private file layout or listed test. It does not relax their required behavior. Read the repository `AGENTS.md`, the applicable Rust skills, and [RUST_DESIGN_GUIDELINES.md](RUST_DESIGN_GUIDELINES.md) before implementing.

## New branch and replacement crate

When implementation starts, create a new branch with the `codex/` prefix from the agreed spec baseline. Build the replacement in one new Rust crate, named and placed using the repository's integration-crate conventions. This explicit requirement overrides the earlier specs' placement inside the existing engine crate and their instructions to modify existing implementation files.

Keep existing implementation source files unchanged. Use the current implementation and the earlier labs implementation referenced by the specs as read-only references. Reuse existing public APIs where appropriate; put new code, adaptations and any necessary reimplementation in the new crate. Register the crate with only the necessary workspace/build metadata and lockfile changes. Do not migrate existing callers or delete the old implementation as part of this goal.

The coordinator records the new crate's name/path and maps the specs' logical module ownership to it before assigning builders. Preserve the stage/step interfaces, persisted formats and behavior; existing engine paths identify reference code, not permission to edit it. A private API unavailable across the crate boundary needs an implementation inside the new crate, not an unannounced change to the old crate's visibility.

## Coordinator and implementation goal

When the user starts implementation, the main coordinator creates and owns this completion goal:

> Implement the four-stage ingestion pipeline in a new Rust crate on a new branch, preserving existing implementation source files and the agreed stage and step contracts, using simple Rust, passing the initial behavioral and seam tests plus final integration checks, and committing each accepted milestone.

Writing this workflow does not start that implementation goal. Once implementation is authorized, the coordinator carries it through the milestones without asking for permission again for routine builder assignments, private refactors, verification or the milestone commits required here. Ask the user only when an unresolved product choice or a change to the agreed scope requires their decision.

| Role | Responsibility |
| --- | --- |
| Coordinator | Own the overall goal, branch, milestone order, shared contracts, integration harness and progress record. Define each assignment, inspect evidence, decide acceptance and create milestone commits. |
| Builder subagent | Implement the active milestone, simplify private code where appropriate, add the relevant high-value tests, run checks and resolve review findings. Edit only the assigned scope; report shared contract problems to the coordinator. |
| Independent reviewer subagent | Use Astra for this role, following the agreed review preference. Inspect the actual diff, contracts and test evidence independently. Review correctness, Rust design, unnecessary complexity, resource safeguards and compatibility with completed stages. Report blocking findings separately from optional improvements; do not edit or commit. |

The reviewer must not be the builder reviewing its own work. The builder's summary is useful context, but is not proof. The coordinator remains accountable for the combined result even when both subagents report success.

Only one implementation milestone is active at a time. Do not dispatch builders for later stages while the current one is being implemented or reviewed. A milestone may be split into smaller sequential builder assignments; each retains the same acceptance gate. Stage 2 has two specification files, but is one stage milestone: implement row preparation first, then diffing, retaining the `prepare_rows` seam.

## Milestones and commit boundaries

| Order | Milestone | Acceptance evidence before its Git commit |
| --- | --- | --- |
| 0 | Shared foundation | New branch and crate registered against the agreed baseline; shared types and utilities; executable expected fixtures; marker publication/reuse, conditional local/S3 state transitions and decimal-export boundary tests. No dependency on unfinished stage implementations to run these tests. |
| 1 | Stage 1: Capture | Apply/adopt capture behavior, capture time, valid empty output, publication and retry behavior, and stage-1 error classification. Output agrees with the independently reviewed capture fixtures. |
| 2 | Stage 2: Hash and diff | Row preparation and diffing together: IDs/hashes, guards, reserved inputs, changed/archive outputs, resend handling and numeric publication rules. Run with actual stage-1 output and compare against the expected stage-2 fixtures. |
| 3 | Stage 3: Plan writes | Actual stage-2 output produces the expected request bodies, ordering, batch boundaries and property-removal behavior. Resume from checkpoint files on fresh scratch. No running stage-4 implementation is required for acceptance. |
| 4 | Stage 4: Send and commit | Delivery/fallback/rejection behavior, current-state authority, takeover and replay cases; all four stages integrated through the shared S1–S9 suite and required Graph HTTP cases. |
| 5 | Final integration verification | Re-run the relevant combined checks for the new implementation, confirm its local and workflow entry points use the same pipeline, verify existing implementation sources are unchanged, and reconcile the deferred-findings list with delivered behavior. Commit any resulting fixes; no empty commit is required when no files change. Switching existing production callers is outside this goal. |

The detailed initial test set below defines the scope of these gates. Earlier stages are accepted against completed predecessors and independent successor fixtures; they do not wait for the entire end-to-end suite to become runnable. The coordinator explicitly tracks the remaining integration checks and requires them before marking the overall goal complete.

## Builder and reviewer cycle

1. **Assign.** The coordinator supplies the milestone, base commit, applicable specs/guidelines, owned files, shared interfaces, test cases and completion criteria. Record the assignment before dispatching the builder.
2. **Build and verify.** The builder implements and tests the milestone. It returns the changed files, important implementation decisions, commands/results, and any unresolved concerns. No unapproved behavioral contract changes or private substitutes for shared APIs.
3. **Review independently.** Give the reviewer the actual patch against the recorded base, the current specs and verification evidence. The reviewer checks the integrated code, challenges missing behavioral coverage, and runs targeted checks when evidence needs confirmation.
4. **Fix and re-review.** The builder resolves blocking findings. Re-run affected checks and have the reviewer verify the fixes against the resulting diff. A new change after review must receive review appropriate to that change; a previous approval is not approval of unseen edits.
5. **Accept.** The coordinator checks the completion criteria, confirms required tests/checks passed, and records the result. A missing prerequisite or failed required check leaves the milestone pending. Optional additional coverage can be recorded for later; a violated mandatory contract cannot be deferred merely to advance.
6. **Commit and advance.** The coordinator commits the accepted milestone and reports its SHA, scope and verification. Only then assign the next milestone against that commit.

## Git and progress records

- Use one integration branch for this sequential implementation. Before the foundation milestone, establish a committed spec/baseline checkpoint so later stage diffs have a stable starting point. Inspect the worktree and keep unrelated user changes out of commits.
- Create a Git commit after the shared foundation and after each completed stage. A larger stage may have coherent intermediate commits, but it still needs an accepted completion checkpoint before the next stage starts. Builders and reviewers do not commit independently.
- Include the implementation, relevant tests and any approved spec/progress updates together. Run the relevant checks and `git diff --check`, inspect the staged diff, and follow repository hooks; do not bypass a failed check to create a completion checkpoint.
- Use sentence-case imperative messages without semantic prefixes, for example `Add shared ingestion pipeline foundations`, `Implement ingestion capture stage`, `Implement ingestion hash and diff stage`, `Implement ingestion request planning`, and `Implement ingestion delivery and commit`.
- Keep accepted milestone commits distinct. Later integration fixes use additional descriptive commits; do not rewrite earlier accepted checkpoints merely to hide a discovered defect. This workflow authorizes local milestone commits; pushing, publishing or merging follows the user's separate instructions.
- Keep a concise progress record when implementation starts: active milestone, base commit, builder/reviewer ownership, contract decisions, relevant test commands/results, unresolved blockers and deferred follow-ups. Include the acceptance evidence with the milestone changes; report the resulting commit SHA after committing and recover it from Git history on resume. Do not attempt to embed a commit's own SHA inside itself.
- On interruption, the coordinator resumes from the progress record, Git history and current diff. Do not assume an agent's earlier success message proves the current tree is reviewed or tested. Mark the overall goal complete only after the final integration gate and all required commits are done.

## What must stay fixed

- The four stages, their steps and ownership, the checkpoint boundaries, and the operations that use them.
- Stage entry points and the stage-2 `prepare_rows` seam, shared input/output types, and APIs consumed by another implementation owner. `01-contracts.md` is the shared contract; `shared-run.md` supplies its detailed shared behavior.
- Stored schemas, ordering, exact request JSON, marker publication rules, retry/error classification, state transitions, cancellation semantics, and the declared resource/IO safeguards.
- Behavioral expectations in `03-scenarios.md`, including the recovery and schema-boundary cases added in this review.

An implementation agent must not silently change these to make its stage easier. Report a proposed contract change with the affected producers, consumers and fixtures, settle it centrally, then update all affected specs together. A private change needs no permission when it preserves these contracts.

## What an implementation agent may simplify

Private functions, intermediate structs, helper names, local signatures, module nesting and pseudocode are examples. Merge functions when that shortens the path to meaningful behavior, remove forwarding helpers, keep a small loop local, or introduce a focused helper when it expresses one rule used in several places. There is no target function count and no requirement to reproduce the documented 209-function decomposition.

Do not merge stages or erase a step's responsibility to reduce the number of functions. In particular, keep `prepare_rows` available to its independent consumer. Preserve explicit ownership of shared rules; copying state predicates, decimal validation or error classification into multiple stages is not simplification.

Review the resulting Rust against these questions:

- Can a reader find the behavior from the module names and follow its execution directly?
- Does each private helper name a useful operation, or merely forward arguments?
- Does each custom trait, generic parameter, wrapper or new crate solve a current problem?
- Are visibility and re-exports limited to actual callers? Are ownership, blocking IO and bounded buffering still clear?
- Does the change remove concepts rather than merely move them to different files?

Keep the repository's ordinary Rust style and error-stack rules. No new framework, stage trait, macro system or backend abstraction is needed for this rewrite. A brief implementation note should identify significant simplifications and their preserved contracts; a private helper merge does not require a separate design document.

## Establish the shared foundation once

1. Create the implementation branch and new crate from the agreed spec baseline. Consult the branches listed in `shared-run.md`, section 5.1, as reference material for the required behavior and APIs; do not merge their source changes into existing crates merely to reproduce the earlier in-place implementation plan.
2. Assign one owner to shared APIs, the executable fixture set and the end-to-end harness. Stage owners own their stage internals and propose changes to shared files through that owner. Record the file ownership for the actual implementation run before dispatching agents.
3. Establish the shared types and the agreed stage/step signatures. Compile the shared code independently; do not add production placeholder implementations for future stages merely to satisfy a scaffold. Keep fixtures and expected outputs independent of production code: a producer's current output must not automatically become its consumer's expected result.
4. Build canonical checkpoint fixtures from the scenarios, with decoded schemas/ordered rows and exact JSON expectations. Producer tests assert these expectations; consumer tests load the same files from a fresh scratch directory. They must not require another stage's implementation or leftover workspace state to run.
5. Review, accept and commit the foundation, then implement stages 1–4 in order. Integrate each stage with the completed stages before accepting it. The coordinator owns shared changes throughout; a stage cannot be declared complete against an improvised local substitute for the shared contract.

The fixtures need not be hand-maintained binary blobs. A deterministic test builder from independently reviewed expected rows is sufficient. Do not snapshot bytes that the contracts deliberately leave free, including Parquet encoding, file size and cross-attempt artifact hash.

## High-value tests first

The initial acceptance set is deliberately smaller than the union of every test table in the stage specs. The tables remain a case inventory, not a checklist of one test per private function. Parameterize related cases and share fixtures where that improves clarity.

| Area | Initial acceptance evidence | Owner |
| --- | --- | --- |
| Core run behavior | S1–S9 in one shared run-level suite: initial load, unchanged/changed/deleted rows, rename/version changes, rejection recovery, interrupted send, restore and reconcile | Harness owner, with stage owners supplying assertions |
| Stage seams | Producer output and consumer input agree on schemas, ordered rows, IDs, null handling and exact request bodies; resume from persisted artifacts on fresh scratch | Each producer and consumer |
| Publication/replay | A retry uses the winning marker, incomplete output is not bound, and a lost commit acknowledgment does not resend or overwrite a newer state | Shared and send owners |
| Competing senders | Conditional create/update races on local storage and S3/MinIO; takeover before the next batch, during retry backoff and before a fallback; stale commit refused | Shared and send owners |
| Schema validity | Reserved accessor rejection with metadata still usable; valid signed 128-bit decimal round trip; oversized/nested decimal rejection before publication; unsupported unsigned logical types fail before conversion | Rows and shared export owners |
| Guards and delivery boundaries | Duplicate IDs, coverage/archive guards, batch count/byte limits, create/patch fallback, entity-before-link and link-before-entity-archive ordering | Responsible stage owners |
| Graph contract | The actual planned JSON sent over HTTP can be replayed without a new edition for supported fixtures; whole-property replacement removes a property; bulk failure applies nothing; expected conflict/not-found statuses and intended actor/read-only behavior hold | Graph integration owner |

Do not duplicate all nine scenarios as separate full suites in every stage. Use focused stage tests where they exercise a seam independently or distinguish a plausible defect that the shared suite would miss. Test names identify the subject and case; assertions establish the result. Keep error assertions specific and avoid tests that only repeat serde/clap behavior, a trivial mapping, or the current private decomposition.

Run tests and lints appropriate to the touched Rust packages when implementing code. A documentation-only update checks document consistency and formatting; it does not establish runtime correctness. Before production use, the real Graph contract and storage concurrency tests above must run on the combined implementation, not only on older store-level probes.

## Later coverage and completion

After the initial acceptance set passes, prioritize additional cases by observed failures, remaining correctness risk and representative workload limits. Exhaustive error-code mappings, redundant format round trips, private-helper tests, broad permutations and unmeasured tuning can wait unless a concrete defect makes one necessary. Existing valuable regression tests should be retained or replaced with equivalent behavioral coverage when code moves.

A stage is complete when its mandatory contracts and initial relevant tests pass, integration with completed stages agrees, independent review has no unresolved blocking findings, and its acceptance checkpoint is committed. The full shared suite and required real-service checks must pass at the final integration gate. Record unimplemented test candidates and limitations honestly. Passing the initial set does not resolve the explicitly deferred items in [06-review-findings.md](06-review-findings.md).
