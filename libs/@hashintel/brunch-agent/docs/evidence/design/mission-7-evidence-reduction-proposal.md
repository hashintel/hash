# Proposal — Reduce Mission 7 evidence without losing living consumers

## Status and authority

**Bounded pass completed; procedure retained for provenance.** The [disposition audit](../implementations/fe-1573-step-a/landing-20260909/evidence-reduction.md) records the actual keep-set, relocations, retirement and checks. No further deletion is authorized by this now-historical proposal.

**Authorization used after persona/browser integration.** Lu instructed the parent to proceed and retain the bounded evidence reduction; `b4030f1` separately amends [MISSION.md](../../../MISSION.md) before dependent work. The mission authorizes living-consumer relocation and explicitly inventoried redundant contract-packet retirement with the protected exceptions below. This document supplies the procedure, not an additional execution authority. Test consolidation, ledger mutation and external archive cleanup remain excluded.

The credential/accounting stop remains intact. Reduction is independent maintenance, not a prerequisite for persona use or Step A acceptance. The original proposal's inventory is an observation to refresh, not permission to delete unclassified paths.

The authority amendment is committed separately from implementation. [SIDE_QUEST.md](../../../SIDE_QUEST.md) is already active for git-guidance remediation; do not create, replace or implicitly broaden a side quest to authorize this work. Follow [AGENTS.md](../../../AGENTS.md)'s authority-amendment, rationale-before-disposal and shared-worktree rules.

## Objective

Reduce the branch's evidence review surface by separating reusable inputs, live accounting and surviving decision rationale from completed contract-establishment packets. Preserve useful executable regressions. Stop treating accumulated synthetic browser captures as a substitute for the continuable elicitation trajectory the mission still needs to produce.

The desired outcome is a small, navigable evidence index, byte-preserved fixtures beside their consumers, reusable safety tooling outside historical evidence, and an explicit disposition for retired material. A lower file count is a consequence, not a quota that overrides a living consumer.

This cleanup is not a prerequisite for persona-driven product use. It must not grow into a new proving campaign, export framework, fixture fabrication exercise or test-consolidation project.

## Evidence baseline and limits of this inventory

The inspected context root is `libs/@hashintel/brunch-agent/`. Unless prefixed with another repository path, paths below are relative to that root. `E/` abbreviates `docs/evidence/implementations/fe-1573-step-a/`.

The read-only snapshot used HEAD `76dd763e0c8eaa751c8384eb9bed9192298bcf3c`; the inspected merge-base with `origin/main` was `e1593aecbd7561b240ec4440604187c6442bc895`. These identify this observation, not required future ancestry or durable archive guarantees.

| Observation | Inspected value |
| --- | --- |
| Files physically present under `E/` | 7,762 |
| Logical file bytes | 218,658,591 bytes, approximately 209 MiB |
| Filesystem allocation reported by `du -sh` | Approximately 230M; distinct from logical payload size |
| Gzip / PNG files | 6,759 / 308 |
| Committed diff against the inspected merge-base | 7,760 files changed; 369,568 inserted text lines |
| Files under `E/` already present at that merge-base | None |
| Existing evaluation evidence outside `E/` | Approximately 7M by `du`; excluded from this cleanup |
| Distinct directly verified test-loaded files under `E/` | Nine, totalling 110,458 stored bytes |

The original estimate of approximately 8,500 files / 236 MB describes the scale but is not an exact deletion inventory. Likewise, the claim of ten test fixtures was not reproduced: the nine concrete files are listed below. Refresh the consumer and path inventory immediately before execution, including dynamic paths, documentation references and files produced by scripts; this table is not proof that every indirect consumer has been found. This is a targeted inventory refresh, not another freeze of the installed dependency/build forest. The subsequent persona/browser join adds `apps/brunch-agent/test/persona-browser.integration.ts`, which directly references the historical guard location; inspect its final operator instructions and commands as well when relocating those assets.

Examples of the accumulation are confirmed: a 2.6 MB typed-state source/build manifest; 43 `session.json.gz` files in `sibling-browser-integration-alpha`; four approximately 12,000-line passage-policy result files; and a 21M construction-readiness packet. Large compressed native-request and context dumps, not just pin manifests, dominate byte savings. Pin removal primarily reduces text review surface.

At inspection, `E/landing-20260909/mission-health-comparative.md` was untracked despite being linked from MISSION.md. Preserve it and establish its ownership and intended inclusion before cleanup; do not assume that any untracked evidence is disposable or already recoverable from Git. Inventory all other unexpected files afresh.

## Retention rules

Apply [evidence economy and evidence identity](../../../evaluations/README.md#evidence-economy), not age or a filename pattern alone.

1. **Living executable input:** preserve the exact bytes and move beside the owning consumer when suitable. Moving an input must not weaken the assertion or silently normalize its contents.
2. **Named trajectory input or unique real contact:** keep the smallest coherent material a named later proof will actually inspect or consume. Label its limits; a synthetic capture may be a regression input without becoming elicited testimony or import authority.
3. **Unresolved accounting or incident evidence:** keep the coherent packet and its identity until explicit disposition. A summary or HTTP401 is not evidence that a request cost zero.
4. **Surviving decision rationale:** preserve the adopted reason, relevant counterexample and bounded result before retiring its surrounding workbench. A commit mapping alone does not explain why a constraint exists.
5. **Completed contract-establishment material:** eligible for explicit retirement when it has no remaining consumer and its needed rationale has a surviving home. Eligibility is not deletion permission.
6. **Historical recoverability:** choose explicitly between keeping bytes live, preserving a selected artifact durably, and intentionally not preserving it. Do not promise recovery from an incidental branch commit.

These distinguish two different actions: retiring a packet and deleting a regression. Only the first is proposed here.

## Keep and relocate

### 1. Regression inputs: nine verified files

Move these byte-for-byte into fixture directories beside their tests. App fixtures belong under `apps/brunch-agent/test/fixtures/`; plugin-owned fixtures belong under `packages/plugin-sdcpn/test/fixtures/`. Final subdirectory names follow local package conventions. Retain distinct fixture identities during this change even where files happen to be equal; deduplication is not required.

| Source under `E/` | Current consumer | Proposed home |
| --- | --- | --- |
| `typed-state-checkpoint/browser-final/history.json.gz` | `apps/brunch-agent/test/aggregate-why.test.ts` | App aggregate-why fixtures |
| `root-creation-post-capacity/browser-final/history.json.gz` | Same test | App aggregate-why fixtures |
| `root-creation-post-capacity/browser-final/why.json.gz` | Same test; supplies the current workpiece and binding | App aggregate-why fixtures |
| `joined-browser/final-run-3/history.json` | `apps/brunch-agent/test/root-arc.test.ts` | App root-arc fixtures |
| `joined-browser/final-run-4/history.json` | `apps/brunch-agent/test/reconciliation.test.ts` | App reconciliation fixtures |
| `a5-product-tracer.8ijsbgGT/serialization-fixture/a5-history.json.gz` | Same reconciliation test | App reconciliation fixtures |
| `a5-product-tracer.8ijsbgGT/serialization-fixture/record.json.gz` | `packages/plugin-sdcpn/test/reconciliation.test.ts` | Plugin reconciliation fixtures |
| `a5-product-tracer.8ijsbgGT/serialization-fixture/observation.json.gz` | Same plugin test | Plugin reconciliation fixtures |
| `landing-20260909/historical-five-call-ledger.json` | `apps/brunch-agent/test/provider-accounting.test.ts` | App accounting fixtures |

`why.json.gz` is mandatory; retaining only the root history breaks the aggregate test. The historical five-call ledger is an immutable regression premise, not current budget authority. Tests must continue to work on disposable ledger copies and must not replace that premise with the mutable live ledger.

Preserve compact fixture provenance: original path, stored-byte hash, synthetic/actual-capture label, what the test consumes and what the fixture cannot prove. Existing compressed bytes need no recompression. These histories are actual product-record captures from synthetic runs; they are not a curated production elicitation session and must never be used as seed/import authority merely because they moved into a fixture directory.

### 2. Reusable network-safety tooling

Move the complete reusable guard unit together, preferably beside its evaluation-driver consumers rather than under a dated evidence packet:

- `E/native-local-delivery/loopback-only.sb`
- `E/native-local-delivery/deny-network.sb`
- `E/native-local-delivery/commit-network.sb`
- `E/native-local-delivery/verify-network-guard.mjs`
- `E/native-local-delivery/NetworkGuard.java`

The earlier review found the verifier but missed its transitive Java dependency. The verifier resolves all three profiles and `NetworkGuard.java` relative to itself. `commit-network.sb` is not directly referenced by the paid driver, but it is exercised by this verifier; it is not dead merely because the driver only names two profiles.

Update the known consumers and their path assumptions together:

- `apps/brunch-agent/src/evaluations/real-provider-a5/browser-session.ts`
- `apps/brunch-agent/src/evaluations/real-provider-a5/manifest.ts`
- `apps/brunch-agent/test/reopened-why-retention.sh`, including its verification call, guard path and instrument enumeration roots
- `apps/petrinaut-website/README.md`
- Live MISSION.md and retained installation instructions where they direct readers to the old location

Keep `E/native-local-delivery/installation.md` and `network-incident.md`, or relocate them with explicit updated links. They preserve the safety boundary and historical incident disposition. Inspect any remaining runtime helper such as `installed-runtime.mjs` for a real consumer before classifying it; do not infer that every executable-looking file is either required or disposable.

`apps/brunch-agent/test/history-retention-diagnostics.sh` is a producer: by default it creates `a4-safety-*` packets under `E/`. Propose changing only its default output destination to a fresh temporary directory while preserving explicit caller-selected destinations and output-path reporting. This prevents routine reruns from repopulating the retired campaign. It is a bounded script change requiring cleanup authorization, not something performed by this document.

Moving these files changes future instrument enumeration. Update the maintained instrument code; do not rewrite historical freeze identities to pretend they used the new paths. No historical activation becomes reusable as a result.

### 3. Unique contact and live accounting

| Keep | Named consumer and limits |
| --- | --- |
| `E/a1-paid-2026-09-08T08-44-14-222Z/` | Retain the coherent successful real-model corpus, including native inputs/results/history and associated interpretation. It supports later comparison with actual nested `addType` emissions. It does not confer genuine elicitation, current-carrier breadth or Step A credit. Approximately 29 files / 1.3M. |
| `E/usage-ledger.json` and `E/attempt-ledger.md` | Current unresolved accounting. Preserve bytes, permissions and authority; no correction, hold release or allocation is part of cleanup. |
| `E/a5-real-provider-20260909-r2-outcome/` in full | Preserve the native request/HTTP401 response, accounting observations, activation/transport/lifecycle evidence, post-run audit, worker-failure distinction and manifest as one coherent packet until disposition. |
| Accounting-relevant activation/freeze material referenced by the above | Inspect before retiring surrounding provider trees. Retain the minimum needed to interpret the unresolved request and bind its authorization/instrument; blanket pin deletion must not cross this exception. |

The original proposal's r2 slim result is too aggressive while the hold is unresolved. The native response is an authentication failure, whereas `worker-failure.json` records a separate coding-worker overload; these must not be conflated. Six attempts, five complete, US$0.09113535 confirmed catalogue spend and US$7 held remain the recorded state, not a cleanup finding that disposes the unknown row. Preserve the outcome packet now; decide later whether accounting disposition permits slimming it.

Do not copy the mutable live ledger into the proposed landing index as another authority. Link to it. The original failed-run worktree was already removed under separate owner-authorized cleanup. Its raw run, including the store, was preserved under `/Users/lunelson/.pi/agent/session-artifacts/01a08002-25a3-7436-bdca-5cd981ff9560/worktree-cleanup-20260909T071342Z/preserved/m7-provider-execution/`, retaining the original repository-relative paths. Leave that external preserved material and other external sources untouched. This is a relocation record, not a claim of supported store restoration or independent verification by this proposal.

### 4. Compact rationale and bounded-proof index

Use `E/landing-20260909/` as the surviving navigation point rather than creating another full campaign packet. Retain:

- `mission-health.md`, `mission-health-comparative.md`, `integration.md` and `lane-dispositions.md`: route assessment, limits, integrated-work mapping and accepted/superseded distinctions.
- `shared-aggregate-decision.md`: why current aggregate answers conservatively refuse rather than inherit a descendant's basis.
- `typed-original-review/` and its `review-artifact-manifest.json`: the small independent counterexample packet behind that decision, approximately 76K. Preserve rather than replace it with a producer's verdict.
- One current class table, presently `E/typed-state-checkpoint/class-table.md`. Older matrices are candidates for retirement only after checking for a surviving unique limitation or rationale. The current table is diagnostic, not an execution queue.
- Links to unique contact, live accounting and moved fixtures/guard tooling, with clear ownership and retention labels.

**Protect `E/a5-process-retention/reviewed/` initially, pending a specific retention decision—not permanently because it was accepted.** The lane audit explicitly identifies this, not `final/`, as the accepted bounded proof. Retain its interpreting handoff/integration material and the manifest needed to read that proof coherently. It supports a historical original-store/process/compaction claim; it is not a genuine-record probe or portable fixture. Duplicate recovery attempts can be retired without treating this accepted packet as another duplicate. Further reduction requires identifying the exact retained claim, preserving its discriminator and rationale, and explicitly deciding what raw recoverability is still required. A one-page note with an unprotected branch SHA is not an equivalent retention guarantee. Acceptance is not a third permanent retention category: ask whether a later trajectory will consume these bytes or whether they only established a now-tested contract. If the latter, the packet can be explicitly retired after preserving needed rationale and disposing of its raw-recovery claim. The initial protection prevents accidental loss while making that decision; it does not settle it in favour of indefinite retention.

Review other final lane notes for sole surviving reasons behind active limits, including passage continuity, serialization equivalence, capacity semantics, recovery and native carriage. Keep only those reasons in their existing compact home or the landing index before retiring surrounding packets. A later consumer may need a decision's reason without ever loading its original session tree.

### 5. Leave evaluation and Voice evidence alone

`docs/evidence/evaluations/` is outside this reduction. Preserve Vestera evaluation IRs/transcripts and their interpretation, including the prospective-baseline comparison range and the headless IR actually read by `apps/brunch-agent/src/evaluations/runbook/construction-run.ts` at `docs/evidence/evaluations/vestera-runbook-headless/runbook-headless-2026-08-28T11-03-53-683Z.ir.md`.

Do not reopen, regrade or retire failed Mission 4 protocols in this change. Their validity and rerun dispositions remain as recorded. Preserve Mission 6b's small owner-witness packet under `docs/evidence/implementations/voice-resumable-reconciliation/`; it is neither the target nor this branch's principal evidence growth.

## Retirement candidates after keep-set extraction

These are classification groups for an explicit path inventory, not authorized recursive-delete patterns. Anything absent from the inventory remains untouched. Each group is conditional on resolving executable references, live accounting, unique rationale and accepted-proof exceptions above.

| Candidate group | Proposed disposition and exceptions |
| --- | --- |
| Instrument archaeology | Retire redundant `source-and-build-manifest.json`, freeze/pin copies and installed-runtime inventories that only certify unchanged historical inputs. Preserve identities needed by protected accounting or accepted proof. Git source alone cannot reconstruct arbitrary installed/build bytes. |
| Sibling and real-provider harness forests | Retire duplicated sibling session trees, readiness/review/integration snapshots, shutdown/final-preflight copies and superseded activation scaffolding after extracting safety tooling and protecting r2 accounting context. Old grants remain consumed; neither their removal nor retention activates another call. |
| Recovery campaign duplication | Retire redundant material in `local-recovery-wnhhyezf`, `local-recovery-review-KWim2OUc`, `a5-recovery-integration-alpha`, `local-recovery-integration-alpha` and process-retention development/final attempts. Inspect other similarly named packets explicitly. Do not include the accepted `a5-process-retention/reviewed/` proof by default. |
| Superseded red/green attempts | Retire construction-readiness admission/renderer/reopen attempts, `a5-product-tracer.8ijsbgGT/browser-first` through `browser-fourth`, typed-state red runs, root-creation earlier reds, passage-policy run/replay/mutant duplicates and equivalent integration copies. Keep extracted serialization/history fixtures and any sole counterexample needed to interpret an active decision. |
| Lane certification and surveys | Retire redundant `a1-carriers`, `a2-*`, `a3-*`, `a4-*`, native-schema, joined-browser, passage-policy, admission, capacity, transport-initialization and construction integration packets after their surviving inputs and rationale are accounted for. A landing commit citation alone is not sufficient to discard unique rationale. |
| Landing verification dumps | Retire repeated typed/root/legacy browser captures and logs once retained claims point honestly to surviving evidence or explicitly to historical results. Preserve the original typed review; keep the historical accounting fixture at its new home. |
| Screenshots and miscellaneous logs | Retire synthetic screenshots/logs with no remaining visual or diagnostic consumer, as part of their classified packets. Do not delete all PNGs globally: some belong to protected proof packets. |

The original approximately 230 MB / 8,000-file removal and 2–5 MB remainder are aspirations, not established totals. The corrected protected set includes a full r2 outcome, accepted reviewed recovery evidence, original typed counterexamples and transitive guard assets. Calculate resulting bytes/files from the approved explicit inventory; do not discard protected evidence to meet the earlier estimate.

## Recoverability and attestation policy

**Default recommendation:** deliberately stop retaining redundant pin forests and duplicate completed attempts; keep the named coherent exceptions live. Do not repack the entire 230M tree into `docs/archive/`, which would reduce file count without resolving retention purpose or necessarily reducing PR payload.

For a selected retired artifact whose complete bytes must remain recoverable, choose an explicit durable ref or a narrowly scoped archive/bundle and record its identity and recovery procedure. The repository has a precedent at `docs/archive/evaluations/flue-skill-composition-side-quest-runs.tar.gz`, per-campaign `retired-runs.sha256` files and `apps/brunch-agent/test/retired-run-archive.test.ts`. Reuse that approach only where actual recovery is required; it is not a rule to preserve every redundant packet.

Branch history is not the retention policy. The evidence is new relative to the inspected merge-base; removal before a squash merge would leave those intermediate bytes outside the merged tree and history. Ref deletion, rebases or object pruning can also invalidate incidental commit pointers. Where no durable recovery is warranted, record **intentionally not preserved** rather than promising that Git will retain the bytes. Commit/path references remain useful provenance without being a recovery guarantee.

Manifest integrity must follow packet disposition:

- Keep manifests unchanged with untouched protected packets.
- If a packet is intentionally reduced, preserve its historical identity where required and distinguish the new retained subset from the original attestation. Never silently regenerate a frozen manifest under its old identity.
- Retire an unneeded manifest alongside its retired payload. Do not leave live verification instructions asserting that missing members remain present.
- Update surviving navigation and present-tense retention claims to name the new disposition. Keep historical observations historical; do not rewrite them to pretend the original run used relocated files or lacked the retired outputs.
- Preserve adopted reasons and mark superseded portions before disposal, satisfying AGENTS.md's rationale-before-disposal rule. If the complete source artifact must survive, provide actual durable retention in addition to a commit citation.

In particular, `landing-20260909/artifact-manifest.json` binds verification files and `integration.md` describes them as retained. Retiring `verification/` requires handling both together. `review-artifact-manifest.json` belongs to the separately retained typed-original-review packet and must not be swept away with the general landing manifest.

## Proposed execution sequence, after separate authorization

1. **Freeze the scope, not the installed dependency forest.** Re-read the live mission and accounting stop. Record the current tracked/untracked inventory, owners, sizes, hashes for material being moved/preserved, and external consumers. Classify coherent packets with keep/relocate/durable-retire/discard dispositions and mechanically enumerate their literal members. Write rationale for packet-level decisions and exceptions, not thousands of per-file essays. Unclassified or unexpectedly changed paths are stops, not deletion defaults.
2. **Lift living consumers.** Move the nine verified fixtures and the complete guard unit; update imports, scripts, documentation and instrument enumeration. Add one compact provenance record beside each fixture group without copying campaign manifests or creating a replacement pin forest. Change the retention-diagnostic script's default output root only within the approved envelope. Verify these changes before removing any source packet.
3. **Establish the slim index and protected exceptions.** Keep the landing assessments, current limits, typed counterexample, reviewed recovery proof, unique paid corpus and intact accounting packet. Resolve whether referenced untracked assessments are to be included. Preserve unique lane rationale and coherent manifest relationships. Do not duplicate ledger authority.
4. **Make retention decisions explicit.** Default redundant copies to intentional non-preservation; obtain an explicit choice where durable recovery is required or unclear. Prepare and verify only selected archives before deleting their sources. No external worktree/store/ref cleanup is part of this operation.
5. **Retire in reviewable groups.** Remove unprotected pin copies, then sibling/provider duplication, recovery duplicates, superseded attempts, remaining redundant lane packets and landing verification material. Retire screenshots with their owning packets rather than by extension. Use literal approved paths, not broad globs, for deletion and staging.
6. **Close with a compact disposition audit.** Report actual before/after logical bytes, filesystem allocation where useful, file counts and PR diff surface; list relocated inputs, protected exceptions, intentional non-preservation, durable recovery locations and checks performed. Update affected live links/claims under the approved mission scope. Do not initiate another whole browser campaign simply to certify cleanup.

## Verification and completion gates

Verification follows the narrowest real boundary affected; all commands must be selected from current package tooling and safety guidance at execution time. No paid request, credential probe, fallback provider, hold release or broad installation change is part of these checks.

| Claim | Required discriminator |
| --- | --- |
| Fixture relocation preserved behaviour and input identity | Compare stored-byte hashes before/after and run `aggregate-why.test.ts`, `reconciliation.test.ts`, `root-arc.test.ts`, `provider-accounting.test.ts` in the app and `reconciliation.test.ts` in plugin-sdcpn using their existing Vitest configuration. No changed assertions or fabricated replacement fixtures. |
| Guard relocation remains operational | Inspect relative resolution and execute the moved verifier with its three profiles and Java helper under the existing safety policy. This tests the moved boundary; it grants no paid launch permission and requires no provider request. Missing Java/sandbox support is an explicit verification blocker, not a pass. |
| Script paths and future output destinations are valid | Check shell syntax and maintained references; verify that instrument enumeration includes the moved assets and that the diagnostic script's default output is fresh temporary storage. Do not rerun a full crash/process/browser campaign merely to check a path edit. |
| Accounting was untouched | Compare live ledger/attempt-ledger hashes and permissions with the preflight snapshot. Confirm the unknown row and hold remain; any concurrent writer/change stops this cleanup's accounting comparison rather than authorizing overwrite. |
| Accepted rationale/proof survives | Inspect the landing index, typed-original-review and reviewed recovery packet with their interpreting notes; each retained limit has a real source or explicitly accepted disposition, not just a successful-test count. |
| Retained attestations are honest | Check all required retained members and hashes; distinguish historical source identities from new subset identities. No retained instructions claim deleted payloads remain local. |
| No living consumer points into retired files | Search beyond the context root, including app tests/evaluation code, website documentation, scripts, package commands and mission/planning links. Inspect dynamic directory traversal and output defaults as well as literal paths. Historical references need an explicit disposition, not false live links. |
| Any promised archive is recoverable | Extract selected archives into a fresh temporary directory and verify all promised members by hash, independently of incidental historical Git refs. If no archive is promised, no archive test or new archival mechanism is needed. |
| Scope stayed bounded | Review the exact diff and untracked inventory. Only authorized evidence, fixture relocations, consumer path/output adjustments and associated documentation changed. Tests, product behaviour, safety semantics, ledgers and unrelated work remain intact. Run affected format/lint/type checks in proportion to actual source changes. |

The user-visible maintenance result is: tests consume identical inputs, reusable safety tools have a maintained home, unresolved accounting remains intact, and completed proof campaigns no longer dominate the branch. This is not another major product result. Completion requires all applicable gates, a fully classified deletion inventory and a truthful remaining-evidence index. Failed or unavailable checks remain explicit blockers/limits; aggregate test counts do not substitute for checking moved inputs and guard dependencies.

## Authorized scope and remaining decisions

The `b4030f1` mission amendment covers:

- The bounded MISSION.md amendment and permitted fixture/guard/script/documentation changes, while leaving the existing side quest separate.
- Intentional non-preservation of classified redundant contract packets, rather than reliance on Git keeping intermediate branch bytes.
- Protection of the full r2 outcome and its required authorization/accounting context until disposition, the accepted reviewed recovery proof and the original typed counterexample packet.
- Any selected artifact needing durable retention beyond those live exceptions; do not assume an archive-all requirement.

The path-level inventory and actual size result remain execution-time outputs. Unexpected consumers or unclear durable-retention needs still require a decision before the affected deletion; they do not expand this authorization. This document is not independent authority.

## What reduction does not produce

The mission's strategic artifact remains a sophisticated, visible, correctable and continuable elicitation session, produced through the mounted product, then exported and seeded through inspected owning contracts. Existing synthetic histories can discriminate why/reconciliation regressions; original-store recovery packets can support bounded historical lifecycle claims. Neither establishes elicited evidence, portable connected state, fresh-deployment continuation, teammate demo access or useful ordinary explanation coverage.

Removing the contract packets will not create that trajectory. It should leave the repository clearer about what already works, what is held or limited, and what the next real product use still needs to establish.
