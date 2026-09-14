# Side quest — Reduce tool context without losing evidence

## Relationship, imperative and completion

This is Lu's authorized tooling-context remediation within [Mission 7d](MISSION.md), not a second mission or a change to worked-example acceptance. The continuation of the short OpenAI persona proof filled its context with tool payloads and ended with a truncated response. Make the real Brunch path carry the operational information needed for the next action without repeatedly carrying the full provenance archive. Preserve exact evidence for explanation, correction and original-session reopening.

Lu selected Flue's canonical-context construction boundary, with Brunch-owned deterministic projection rules. Workpiece mutation readbacks count as authoritative content already available to the model. Petrinaut freshness must use existing document revision entries and browser-reported revision identity because users can edit the net directly. These are settled requirements, not alternatives to reopen by default.

The next observation this enables is a longer browser-visible worked-example continuation through construction, provenance questions and correction without the previously observed payload amplification. First establish the mechanism synthetically through the actual built application. This plan grants no new paid observation and cannot establish semantic quality or live-run reliability by synthetic success alone.

**Completion:** the oracle-bound cases below pass on the production wiring, the retained records still support provenance after compaction/reopen, and guidance no longer mandates redundant full reads. Return the implementation, measured payload change, executed checks and limitations to Lu; leave full worked-example acceptance open.

## Cold start and work ownership

- Read [AGENTS.md](AGENTS.md), [MISSION.md](MISSION.md), [Flue routing](docs/reference/architecture/flue-routing.md), [evaluation safety](evaluations/README.md#execution-safety) and the scoped guidance for every changed package. This side quest owns only the tooling-context work described here.
- At drafting, the repository is `hashintel/hash`, checkout `/Users/lunelson/.herdr/worktrees/hash/alpha`, branch `ln/fe-1573-mission-7d-provider-worked-example`. Another builder may be working here. Inspect status and current diffs, establish ownership of overlapping files, and preserve their changes. Clean status does not establish exclusive ownership. Do not interrupt existing terminals, browsers or services.
- The local documentation commit adding this side quest and its mission/future-spine updates establishes the accepted authority before implementation. It does not imply a push. A new checkout will not automatically contain this local branch's work; use the checkout containing it or transfer the exact planning files and required unpushed implementation. Do not substitute `origin/main` for this branch.
- Keep implementation commit-sized and separate from the planning commit. This plan does not authorize pushing, creating a PR, rewriting published history or contacting upstream owners.
- No prerequisite paid run, UI redesign, provider switch or Chris-dependent experiment integration is needed. Implement the bounded path yourself; do not delegate the whole mission merely because it spans packages.

### Starting evidence, not a portable benchmark

Local-only `apps/brunch-agent/.data-wipe-me/persona-runs/run-K8TxLU/` holds `run.json` and native/derived evidence. The six-turn OpenAI Brunch/Sonnet persona run completed; a subsequent seventh-turn continuation truncated. `evidence/before-review-snapshot.json` and `before-review-net.json` preserve the earlier baseline; `snapshot.json`, `trace.json` and `net.json` describe the later state. Resolve original store paths from `run.json`, never from old process IDs. Inspect stores read-only; do not resume, compact or rewrite this run for testing.

The session audit found a final response with `stopReason: "length"`, input 274,802 tokens and output 16, followed by compaction rather than a completed continuation. In the measured seven-turn history, five mutation results occupied 587,133 JSON characters; 100 per-operation before/after snapshots accounted for 460,035 of those characters. Thirteen `read_workpiece` calls returned 105,384 characters, with repeated Markdown and user-source excerpts. These are audit measurements, not token equivalents or universal workload proportions. Reproduce relevant counts from native records when available; do not make tests depend on this ignored run or publish its contents.

### Source map

Full paths below are repository-relative; abbreviated paths continue the package/directory named in the same row. Read the named functions rather than the whole historical documentation tree; recheck current signatures and package versions.

| Boundary | First reads and existing proof owners |
| --- | --- |
| Runtime patch and request construction | Root `package.json`/`yarn.lock`, `.yarn/patches/@flue-runtime-npm-2.0.3-192c31f50c.patch`, installed `@flue/runtime` 2.0.3. Locate `buildConversationContextEntries`, `pathToContextEntries`, `Session.rebuildCanonicalContext`, `Session.runCompaction`, `prepareCompaction` and live tool-result/signal insertion. At drafting these are bundled in `node_modules/@flue/runtime/dist/dispatch-nU3cIlT-.mjs` and `conversation-stream-store-CXwRWonS.mjs`; hashed filenames are not stable API. The runtime patch already carries unrelated fixes that must survive. |
| Brunch registration and model requests | `apps/brunch-agent/src/agents/chat-agent/agent.ts`, `src/app.ts`, `src/provider-admission.ts`, `src/provider-accounting.ts`; current Pi AI version is 0.83.0. Admission, streaming and accounting fixes are not this side quest's redesign target. |
| Browser receipts and transport | `apps/petrinaut-website/src/main/app/local-storage-demo/mutation-record.ts`, `brunch-petrinaut-tools.ts`, `mutate-petrinet-tool.ts`; `libs/@hashintel/brunch-agent/packages/transport-aisdk/src/client-tool-result.ts`. Full client results travel as a canonical signal; do not strip evidence at transport ingress. |
| Revision-based net freshness | `apps/brunch-agent/src/conversation/net-freshness.ts`, `net-ledger.ts`, `reported-document-revision.ts`, and their callers. Follow revision reporting from the actual browser submission through the app before changing freshness behavior. `deriveNetFreshness` compares observed/recorded/reported revision IDs as well as hashes; absent confirmation and unrecorded changes cannot establish freshness. |
| Workpiece settlement, reads and source retrieval | `libs/@hashintel/brunch-agent/packages/core/src/flue.ts`: `createMutateWorkpieceTool`, `createWorkpieceReadTool`; `src/update-workpiece.ts`, `src/workpiece.ts`; `apps/brunch-agent/src/conversation/workpiece.ts`. The workpiece has `revisionId`, `sha256`, and presentation-only `ordinal`. Only the agent mutates it on this product path. |
| Provenance verification | `apps/brunch-agent/src/conversation/why.ts`, `root-arc.ts`, `net-ledger.ts`; the SDCPN plugin's canonical mutation-record and basis/effect contracts. `query_workpiece` joins retained calls/results, verified effects, workpiece revisions/passages and authorized user sources. It does not use model recollection as proof. |
| Guidance and effective tool schemas | Core `src/flue.ts` and `src/update-workpiece.ts`, the mounted core/SDCPN resources, and `apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts`. Trace the actual mounted descriptions: they currently request a post-settlement `read_workpiece` and bundle source/locator discovery into that read. |
| Context, compaction and reopen proof | `apps/brunch-agent/test/integration/history-retention.integration.ts` captures actual faux-provider requests by purpose, invokes runtime compaction and compares retained messages. `test/integration/reopened-why-retention.test.ts` runs create/fold/reopen in three processes; `reopened-why-retention-audit.ts` owns the record checks. `test/persona-construction.integration.ts` and `test/construction-progression.integration.ts` exercise the built app/browser path. |
| Freshness and workpiece controls | `apps/brunch-agent/test/net-freshness.test.ts`, `test/integration/net-freshness.integration.ts`, core `test/update-workpiece.test.ts`, app `test/workpiece-evidence.integration.ts` and `test/integration/native-schema-carriage.integration.ts`. Extend the owning tests; add a focused integration file only if no existing owner fits. |

## Throughlines

### Mutation, retained proof and compact model receipt

```text
Brunch proposes its normal tool call
→ real server/browser executor settles the operation
→ full outcome and evidence are retained through the existing Flue path
→ structured canonical context is projected with Brunch's rules
→ model receives outcomes, usable identities and compact evidence references
→ model continues or requests a fresh definition / specific provenance
→ verifier retrieves the unchanged original evidence when asked why
```

Keep full receipts in canonical storage and public history. Do not make UI transport consumers, history-based verification or persistent workpiece recovery read the lossy model view. A compact mutation result must preserve actual operation order, individual success/failure, partial application, affected identities, actionable errors, final-state references where supported, and the link to the original attempt. Do not turn a partially failed batch into a successful summary.

Remove the repeated full pre/post definitions and proof-only sidecars from ordinary model-facing mutation receipts, not from retained evidence. Select fields from canonical types and verified record shapes; do not recursively delete every property named `definition`, `metadata` or `markdown`. Current-net reads and focused provenance answers have different purposes and must retain their requested information. Audit layout, diagnostics and read receipts for the same duplicated evidence carriage, but do not turn this into generic truncation of every large tool result, skill or document.

### Workpiece content reuse

```text
mutate_workpiece settles R7 and returns its authoritative Markdown
→ that readback is present in the effective model context
→ user adds new information; R7 remains the current workpiece
→ redundant read confirms R7 without another copy of the same Markdown
→ agent updates to R8 when the new information warrants it
```

A successful mutation readback counts just like an explicit read. Candidate Markdown in tool arguments, a failed mutation, a revision pointer without content, or a prose summary does not. New user testimony does not change workpiece freshness. The model may need to update the account, but does not need to reread an unchanged account it already has.

Keep three requests distinct: current document content, exact locator lookup, and authorized source discovery/retrieval. Prefer refining the existing read surface over adding a family of tools. Locator/source-only requests should not require another full document payload. Source excerpts and IDs requested for citation must remain retrievable independently of whether document text is elided; a newer user message is not a reason to invalidate R7. Preserve candidate-versus-settled identity, UTF-16 locator semantics, ambiguity/truncation disclosure and source authorization.

### Net observation and direct edits

```text
model has a verified definition for document/incarnation D at revision N
→ browser reports its current revision on the real submission path
→ same confirmed revision: reuse the exact definition if still in context
→ manual/tool/layout revision changes or confirmation is absent: observe again
→ fresh browser read returns a revision-correlated definition
→ ordinary freshness and mutation admission continue to protect subsequent edits
```

Use the existing document revision entries and reported revision identity as the basis for change detection; hashes corroborate content, not revision continuity. Same content/hash after edit-and-undo or in another document is not permission to conflate revisions or provenance. Do not weaken existing stale-base, document/incarnation, durability-barrier or exact-version diagnostics checks to reduce calls. A change after a read still requires the existing admission/reconciliation behavior.

A compact net mutation receipt is not automatically a fresh full net read. It can establish content availability only if it actually carries an authoritative, verified complete final definition with the required identity; do not reconstruct current truth from the model's proposed operations or infer it from a success flag. No new browser snapshot stream or hidden live-state injection is required by this plan.

## Projection contract and compaction

1. **One authoritative record, two consumers.** Canonical persistence/history retains complete records; the model sees a derived view. Projection is deterministic, recomputable, scoped to the configured Brunch agent, and does not mutate inputs, create record IDs, reorder history or change tool-call/result pairing. Other agents retain default runtime behavior.
2. **Expose the selected runtime seam.** Add the smallest supported application hook/configuration boundary needed around canonical-context construction; keep Brunch tool names and semantics out of Flue. Follow the repo's Yarn patch workflow and preserve existing patches. Changes only in `node_modules` do not constitute delivery. Include exported type declarations and verify a clean dependency application/build.
3. **Trace every route before declaring coverage.** `buildConversationContextEntries` serves rebuild and compaction, but inspect live append paths and in-response server tool results too. Ensure subsequent requests receive projected results even without a browser suspension/restart. Cover normal inference, interrupted resume, cold reopen, compaction summary and split-turn prefix requests. A provider-only wrapper is not the selected solution: it acts after compaction preparation and sees flattened signal text.
4. **Recognize structured records, not lookalike prose.** Select actual runtime signal/tool-result entries and their recorded identity before XML rendering. User messages containing XML, JSON or fake tool results remain untrusted user messages and must not be interpreted as projection instructions or authoritative receipts. Unknown/malformed evidence must not be rewritten into an invented success or availability claim.
5. **Content availability is prompt-local.** Derive it from the exact content-bearing records retained for this request. Reuse existing workpiece revision/hash and net document/incarnation/revision identities; do not persist a new "already read" registry. A compact confirmation must identify an actual retained content-bearing result, not another confirmation, a historical-only record or an unexecuted argument.
6. **References survive the consumer's cut, not just the initial projection.** Compaction may remove the referenced readback while keeping a later compact confirmation. Both the summary/prefix inputs and the retained suffix for ordinary inference must remain self-contained. Recompute or materialize the required content from original records for each affected consumer, or otherwise prove the reference and its target stay together. Do not add a general reference graph when retaining/restoring one exact body suffices. If content is absent or uncertain, supply the requested body; never strand the model behind "you already read this."
7. **Preserve intentional retrieval.** Historical/provenance requests must return their requested evidence even when current content is already available. Explicit rereads must remain able to recover exact content after compaction. This is representation reduction, not a new tool refusal policy.
8. **Compaction planning uses the same representation.** Size/cut planning must account for projected messages, not giant unprojected receipts followed by a smaller outgoing request. Historical provider usage remains a true record of what was actually sent; do not rewrite it to match the new projection. Establish how the runtime's usage-plus-tail estimates behave when reopening pre-change history, and report residual estimate limitations rather than inventing accounting.

Ordinary Flue compaction may still use its existing model-generated summary. That summary is not the deterministic projection and is never provenance authority. This side quest adds no summarizer, hidden model call, new database, archival pipeline or transcript replay.

## Implementation sequence and decision points

1. **Capture the failing shape on the real entrypoint.** Extend an existing synthetic built-ChatAgent request-capture test with a multi-operation receipt containing distinguishable before/after definitions, a workpiece mutation/readback, redundant read, and provenance query. Assert full retention independently from provider request contents. Record current payload counts by category and reproduce the unwanted duplicate context before changing production behavior. Read-only inspection of the earlier run is supporting evidence, not the test fixture.
2. **Deliver compact mutation receipts end-to-end.** Add the minimal Flue seam and Brunch projector, first removing proof-only snapshot amplification while preserving outcomes. Verify normal calls and a fresh-process reopen against the same disposable store. Include a server tool that continues immediately in the same response so an unprojected live path cannot hide behind a successful rebuild test. Re-decide from this path before adding read mechanics.
3. **Make reads reuse available authoritative content.** Implement document-content deduplication with the workpiece/net distinctions above, and separate locator/source retrieval from automatic full-document return. Keep existing stable tool identifiers where feasible. Carry canonical schema/type changes through consumers and effective native schemas; do not change public retained result shapes merely to shrink the provider prompt when projection alone suffices.
4. **Exercise compaction and recovery boundaries.** Force actual threshold/overflow and split-turn behavior synthetically, with a deliberately lossy summary, then reread, query provenance and reopen. Specifically cut away the original content-bearing result while retaining a later read/confirmation. Confirm no dangling references and no second record authority. Do not mask the observed truncation by only increasing limits or changing compaction reserves. If truncated-response continuation remains independently broken after payload reduction, report the residual to Lu; a general retry/recovery redesign is not authorized here.
5. **Align guidance and qualify the full path.** Replace unconditional workpiece read-before/read-after instructions with reuse of successful authoritative readbacks, reread on changed/unknown/missing content, and focused source/locator retrieval. Preserve net revision checks and provenance discipline. Inspect the actual mounted descriptions, not only source prose. Run the combined oracles below; report mechanical payload improvement separately from any unobserved change in model call frequency or latency.

The exact hook signature, compact receipt shape and read input options are implementation choices within these contracts. Choose the smallest coherent API after inspecting the current runtime. If the seam cannot cover live results and compaction without rewriting storage semantics, stop with the concrete failing route rather than substituting a provider wrapper or parallel store.

## Oracle-bound proof

These are required discriminators, not reported passes. Use asymmetric values and both sides of each boundary. Extend existing owners where possible; new cases must be executable through their package scripts and must fail the plausible wrong implementation named here.

| Required result | Concrete oracle / distinguishing case |
| --- | --- |
| Full evidence remains, ordinary prompt shrinks | Built-app capture using `test/integration/history-retention.integration.ts` or a focused sibling run by `test:integration`: inspect the actual provider context after a browser mutation signal, public history and disposable persisted records. Use differing pre/post snapshots for multiple operations. Full snapshots remain in storage; prompt retains outcomes/IDs/errors but not proof-only copies. Compare fields structurally, not only total size. |
| Immediate server-tool continuation is projected | In the same built-app capture, make `mutate_workpiece` return and continue without user/browser suspension. The next provider call receives the intended representation. A patch affecting only reopened contexts must fail this case. |
| Mutation readback satisfies workpiece availability | Extend core workpiece tests plus the built-app capture: successful R7 settlement, a new user message, then `read_workpiece`. Keep one content-bearing result for R7 and a valid reference on the duplicate; authored candidate arguments are separate, not authoritative readbacks or a reason to rewrite tool-call history. Controls: failed settlement, pointer-only output, and same text at a different revision cannot be treated as the same authoritative R7 readback. |
| Evidence lookup is independent of document freshness | Extend `test/workpiece-evidence.integration.ts` and core locator tests: request a new authorized source and literal candidate/current locators without retransmitting the current workpiece. Assert exact IDs/offsets, unchanged R7, no candidate settlement and no admission of assistant/tool text as testimony. |
| Net revision changes defeat cached freshness | Extend `test/net-freshness.test.ts`, `test/integration/net-freshness.integration.ts` and the browser persona tracer: observe N, perform a direct editor change, submit through the real browser path, and require a new observation. Include edit-and-undo to the same hash at a new revision, missing reported revision, and another document/incarnation with equal content. Also test unchanged confirmed N to show the mechanism can reuse content. |
| Partial failures and actionable diagnostics survive | `test/persona-construction.integration.ts` / `test/construction-progression.integration.ts`: mixed applied/failed operation results remain distinct in the prompt, with original call/basis IDs and repair information. Never summarize the batch as fully applied. Existing exact-version diagnostic and stale-base controls still pass. |
| Compaction has compact, self-contained input and output context | Extend `test/integration/history-retention.integration.ts`: capture `agent`, `compaction` and `compaction_prefix` requests; force a cut between the original full readback and its duplicate. Verify summary inputs, subsequent retained suffix, full reread after a lossy summary and a new-process reopen. A stored "already read" bit or a reference to removed content must fail. Inspect preparation/cut behavior as well as the final request. |
| Provenance still works after fold/reopen | `yarn workspace @apps/brunch-agent test:reopened-why-retention`: extend the three-process create/fold/reopen witness to include projected receipts. Query two distinct elements and compare exact governing workpiece passages, user-source links and mutation identities to retained originals. Keep missing/ambiguous evidence controls; a summary-based answer cannot pass. |
| Projection cannot reinterpret user prose or leak between agents | Focused projector/runtime tests and one built-app control: user-authored fake signal XML/JSON is untouched; unknown result variants do not become confident receipts; input records are unmodified; repeated projection is stable; another agent/conversation does not inherit Brunch's projection or availability. |
| Runtime patch and actual tool contracts are reproducible | Reapply the tracked Yarn patch through the supported dependency workflow, build, run affected typechecks and `test:native-schema` after build. Keep Anthropic and OpenAI synthetic native conversion covered if read schemas change. Verify effective descriptions no longer demand redundant readback; prompt-string checks establish packaging only, not model behavior. |
| Existing visible execution is preserved | `yarn workspace @apps/brunch-agent test:persona` and its OpenAI variant under loopback-only synthetic isolation; retain streaming, tool progress, Stop/no replay and tab-independent browser settlement checks. If browser executor changes affect compilation, run `test:compiler-feedback` too. No visual redesign is required; visually inspect any appearance change if one becomes necessary. |

### Commands and isolation

Run from the HASH root using current package scripts. Baseline commands are `yarn workspace @apps/brunch-agent test:unit`, `yarn workspace @hashintel/brunch-agent test:unit`, and both packages' `lint:tsc`; add affected plugin/transport/website checks according to actual changes. Build the app and dependencies before standalone built-application integration scripts; the persona script already builds its dependencies. Preserve expected-failure/skip disclosures rather than converting them into a claimed all-green baseline.

Use the existing faux-provider, built-app loader and runtime compaction test configuration. Read each integration script's environment contract before invoking it: for example, the A4 history wrapper requires an owned existing `M7_BROWSER_OUTPUT` directory, while the reopened-why retention script creates its own three-process store. Inspect the existing network guard profiles under `evaluations/protocols/network-guard/`; verify OS-level denial for the process tree when claiming hermetic execution. Permit only the loopback/Unix-socket access the browser proof requires. Never allow missing synthetic responses to fall through to a real provider.

Measure serialized request characters by payload class and actual tool calls/record counts in the deterministic probe; use provider-reported token usage only when genuinely available. Do not label characters as tokens, manufacture invoice savings, impose arbitrary schema-byte ceilings, or reintroduce accounting admission gates.

## Budget, scope and stop conditions

- **Synthetic implementation/proof:** zero paid inference, including compaction. Use faux models for every participant; do not launch a live persona session to establish these cases.
- **Free schema preflight:** if schemas change, follow `evaluations/README.md#tool-schema-acceptance` before any later paid observation, confirming current free pricing and sending only synthetic text/catalogues. No private case or retained-run material leaves the machine. Ordinary dependency installation/documentation research remains allowed.
- **Later live observation:** not allocated by this side quest. Ask Lu for the concrete turn/spend allowance and recording readiness after synthetic qualification. Existing generous-budget preferences and previous six-turn authorization are not permission to replay or extend that run now. Keep the selected OpenAI Brunch/Sonnet persona defaults unless Lu changes them.
- **Excluded:** cross-browser document persistence/recovery, fixture extraction/seeding/distribution, portfolio breadth, provider fallback frameworks, experiment integration/execution, general history consolidation, UI labels/badges, persona style and broad prose/latency tuning. Cross-browser portability is already recorded in [MISSION.next.md](MISSION.next.md#conditional-technical-strains). This work does not promote browser-local nets into Flue storage.
- Stop on loss or mutation of canonical evidence, changed attribution, invented proof, stale net admission, dangling compact references, UI/history consuming the lossy view, unexpected live-provider access, or overlapping work whose ownership is unresolved. Preserve evidence and report the smallest failing case. Passing enforcement tests alone is not a reason to add new refusal policies or limit gates.

## Return and lifecycle

Report: the production route exercised; the patch/API and Brunch projection ownership; measured before/after payloads; how workpiece readbacks and net revision entries govern availability; compaction/reopen/provenance results; exact checks, failures/skips and remaining uncertainties. Distinguish synthetic integration proof from live model behavior. Do not create an extra implementation report or export the private run as a fixture.

Update Mission 7d's current blocker and compaction proof disposition from executed evidence, preserve independent work and deferred scope, and move any surviving residual to its existing planning home. Before mission closure, promote lasting constraints/results to the mission/code/appropriate reference and remove this active side quest under the lifecycle rules. Lu still owns worked-example acceptance and any subsequent paid recording.
