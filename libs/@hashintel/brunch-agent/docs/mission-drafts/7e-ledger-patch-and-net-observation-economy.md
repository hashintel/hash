# Draft Mission 7e — Patch the Ledger by section and stop paying for net observations

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

This draft consumes the WP-F.8 paid observation of Mission 7d (`run-SB5pgx`, 2026-09-15, local-only under `apps/brunch-agent/.data-wipe-me/persona-runs/run-SB5pgx/`). That run met WP-F's discriminator — one upload per revision, evidence by text, no source enumeration, construction after settlement, no stall over 44 revisions and 19 net mutations in 33 minutes — and exposed the two strains this cluster owns: the prompt grew faster than before because every construction step pays for a full net read, and the model collapsed the Ledger to a quarter of its size once uploading it became expensive. The collapse is cost-driven and the model knows it is lossy: the provider reasoning summaries in the retained stream weigh the token cost of re-uploading the whole body, note that dropping sections forfeits evidence relations, and choose a condensed body of a stated target size anyway. No guidance forbids shrinking today.

**Order of attack (Lu, 2026-09-15).** First strategy for collapse protection is a guidance rule plus a server-side shrink guard on `mutate_workpiece`, paired with the net-read economy; section-keyed patching is the follow-on, admitted when the guard's latency tax (every revision still uploads the full body) shows in the paid observation or when the demo timeline allows it. This ordering trades settlement latency for a guaranteed-intact Ledger, which is the cheaper first win for provenance and `query_workpiece`.

## Cold-start reads

Paths are relative to the Brunch context root unless prefixed `../../../` (repository apps).

- **Evidence:** `../../../apps/brunch-agent/.data-wipe-me/persona-runs/run-SB5pgx/` — `dev-brunch-server.log` carries one `[brunch] flue.submission chronology {...}` line per submission (WP-F.6: per-turn duration, time to first event, `cacheReadTokens`, `outputTokens`, per-tool argument characters and delta timing); `conversation.db` (+WAL; snapshot with `sqlite3 <db> ".backup /tmp/run-SB5pgx.db"` before reading) holds ~9.5k stream events including 46 `assistant_tool_call` events named `mutate_workpiece`, 33 `client-tool-result` signals carrying full `read_petrinaut_net` bodies, `assistant_reasoning_delta` provider summaries, and one `compaction`; `session.json` holds the history-view URL and headers (`x-brunch-principal`, `x-brunch-conversation`) for a transcript read while the server is up. `evidence/net-after-mutation-03.json` and `evidence/net-after-mutation-11.json` are the net definitions read just before each Ledger collapse (13 places / 11 transitions / 6 parameters at Ledger revision 9; 17 / 17 / 15 at revision 24), extracted from those signals in the demo website's `net.json` document shape and listed in `evidence/manifest.json` with the observation sha256 they were read under. Local-only per [run-directory retention](../evidence/README.md#run-directories).
- **Ledger tool contract today:** [`packages/core/src/flue.ts`](../../packages/core/src/flue.ts) (`mutate_workpiece` takes the whole `markdown`, `baseRevisionId`, `evidence[]` cited by literal text; stale-base refusals direct the model to `read_workpiece`), [`packages/core/src/update-workpiece.ts`](../../packages/core/src/update-workpiece.ts) (`lookupWorkpieceLocators`, `settleWorkpieceEvidence` carry rule for unchanged unique same-span relations), [`packages/core/src/workpiece.ts`](../../packages/core/src/workpiece.ts). Recovery contract: [`conversation/workpiece.ts`](../../../../../apps/brunch-agent/src/conversation/workpiece.ts) reconstructs a revision from the canonical tool **input** body plus the successful **output** identity (`revisionId === toolCallId`, sha256 of the submitted body, validated `evidence[]` locators); [model-context projection](../reference/architecture/flue-routing.md#model-context-projection) is the model-only contract.
- **Net observation contract today:** [`packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`](../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts) (`read_petrinaut_net` returns the whole definition through `output`, with `output.observation.{toolCallId, sha256}` promoted for `mutate_petrinaut_net.observation`/`baseHash`), [`packages/plugin-sdcpn/src/mutation-record.ts`](../../packages/plugin-sdcpn/src/mutation-record.ts), [`conversation/net-ledger.ts`](../../../../../apps/brunch-agent/src/conversation/net-ledger.ts) (observation verification), and the fresh-base discipline in [`packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md) ("obtain a fresh read after any mutation"; "mutation success never establishes an observation").
- **Projection:** [`context-projection.ts`](../../../../../apps/brunch-agent/src/agents/chat-agent/context-projection.ts) — `projectBrunchContext` already dedupes superseded Ledger result bodies to references, drops client-result `metadata`, projects `mutate_petrinaut_net` output to per-operation status and prefixes user entries with `[message <id>]`; argument compaction (`compactToolCallArguments`) exists but is default-off pending the WP-A.9 acceptance probe and carries a self-referencing `markdownReference.retainedEntryId` that must be fixed before that probe.
- **Panel:** [`brunch-tool-presentation.ts`](../../../../../apps/petrinaut-website/src/main/app/local-storage-demo/brunch-tool-presentation.ts) (per-state labels), the panel tool-row styling beside it, and the Ledger pane which renders a settled revision from its bound canonical input.

## Visible product advance

**Release-note sentence:** Brunch keeps a long interview fast — Ledger updates land in seconds instead of half a minute, the account it keeps never silently shrinks, and a thirty-minute session no longer approaches the model's context limit.

**Product-manager script:** run the Inventory persona for thirty minutes at medium reasoning on both sides. Watch Ledger updates settle within a few seconds of the reply; open the Ledger tab at minute 10 and minute 30 and see the same section structure with more filled in, never a shorter document with sections gone. Watch tool rows show gold while running and green when done. What was impossible before: in `run-SB5pgx` a Ledger update took 22 s at median and up to two minutes, the document lost three-quarters of its text at revision 25 without anyone asking, and the prompt reached 253k tokens and was compacted at minute 27.

## Contract stratum

Stage 1 (first cut): the shrink guard, the guidance rule and the net observation economy. Stage 2 (follow-on, same cluster): Ledger mutation by section. Refusal-recovery guidance and tool-row colour ride with stage 1.

- **The Ledger never shrinks silently — guard.** `mutate_workpiece` compares the submitted body with the base revision and refuses, as an ordinary whole-settlement refusal in the same channel as the evidence and stale-base refusals, when the body drops any heading present in the base or is shorter than the base by more than a stated share, unless the call carries an explicit `retraction` reason naming what the user withdrew. The refusal names the missing headings and the character delta and states that nothing was written, so the model self-corrects in one resubmission. Thresholds are a builder choice inside the guard; the guard is the smallest boundary that makes the observed failure impossible rather than discouraged. It leaves the upload cost untouched, which is the accepted trade for stage 1.
- **The Ledger never shrinks silently — guidance.** The elicitation skill's workpiece section states the rule the guard enforces: every settlement carries the whole prior account with only the changed passages edited; headings and sections are removed only on an explicit user retraction named in the settlement; a body shorter than its base says why. Guidance alone is not expected to hold — the model shrank with the requirement in view and a cost calculation in its reasoning — so the guard, not the prose, is the proof.
- **Net observation economy.** Two independent levers, admit either or both: (a) projection dedupe of superseded `read_petrinaut_net` results — keep the latest full definition in context and collapse earlier ones to `{ observation: { toolCallId, sha256 }, counts }`, the mechanism already used for Ledger results; (b) a model-facing rendering without layout (`x`, `y`, viewport, null/false defaults) and with arcs and code presented compactly, since layout is automated and the model never needs positions. Canonical records and the browser keep the full definition.
- **Ledger mutation by section (stage 2).** `mutate_workpiece` accepts a bounded list of section-keyed operations (`replaceSection`, `insertSection`, `removeSection`, keyed by heading text or heading path; `replaceAll` only for the first revision or with an explicit reason) instead of the whole body. The server reconstructs the full Markdown, computes the same `sha256`, resolves text-cited evidence against the reconstructed body, persists the same revision shape and returns the same identity. Nothing downstream of the settlement changes: `settledRevisionFromPart`, `why.ts`, `declared-basis.ts`, the panel and the recovery contract keep reading the canonical body and output. The recovery contract has to be re-earned, because the canonical tool input no longer carries the body: either the successful output carries the reconstructed body once (one copy, in a result the projection may dedupe), or persistent state carries it and the reopen path is proven to reconstruct from it. Choose by what `history-retention` can prove, not by preference. The stage-1 guard becomes the `removeSection`/lossy-`replaceSection` refusal in this model; it is not a second mechanism.
- **Refusal recovery guidance.** When a settlement is refused for one bad evidence index, the model fixes that index and resubmits the same relations; it does not resubmit with fewer relations. Guidance only, in the elicitation skill's workpiece section, with the refusal message itself naming the rule.
- **Tool-row lifecycle colour.** Pending rows use a gold/yellow basis, settled rows green, errored rows red (red already exists). Website-only styling.

## Boundary crossings and current throughline hypothesis

```text
persona answer → Brunch reasons → mutate_workpiece { baseRevisionId, operations[], evidence[] }
→ core reconstructs Markdown from the base revision + operations
→ evidence text resolved against the reconstructed body → refuse whole settlement on any miss
→ revision persisted { revisionId, sha256, ordinal, body or body pointer, evidence locators }
→ output { revisionId, sha256, ordinal, evidence[], sectionsChanged[], removedChars }
→ projection keeps one body copy in context; panel renders the canonical revision
→ construction disposition → read_petrinaut_net (compact model rendering)
→ mutate_petrinaut_net → fresh read; earlier reads collapse to observation references
→ reopen: conversation/workpiece.ts reconstructs every revision from canonical records
```

## Throughline proof floor

| Required result | Oracle |
| --- | --- |
| A section operation produces the same revision a full upload would | Core unit tests: apply `replaceSection`/`insertSection`/`removeSection` to a fixture and compare `sha256` and body with the full-replace result; heading-path keys with duplicate heading text are unambiguous or refused. |
| Evidence by text still validates against the reconstructed body | Core unit tests over the existing F.1 cases (unique, repeated with `occurrence`, absent, astral-plane) with operations as input; a two-revision case where an insertion above a cited passage plus re-declaration preserves the relation. |
| A reopened process reconstructs every revision without the body in the tool input | `history-retention` integration: create/fold/reopen across processes, every revision's body and validated locators recovered from canonical records only; missing persistent state is an explicit failure. |
| Silent shrinkage is impossible (stage 1) | Core unit tests over synthetic fixtures shaped like the two `run-SB5pgx` collapses (template subsections replaced by ad-hoc headings at half the length; the whole account flattened to four sections at an eighth): both are refused naming the dropped headings and the character delta and write nothing; the same bodies with a `retraction` reason settle; a same-length edit that renames one heading is refused (a rename is loss until stage 2 addresses sections); the first revision (`baseRevisionId: null`) is never guarded; an ordinary growing revision passes. Run bodies stay local-only and are not promoted into fixtures. Then `history-retention`: a refused settlement leaves the recovery ledger at the base revision. |
| Silent shrinkage is impossible (stage 2) | Unit test: a `replaceSection` dropping more than the threshold without `reason` is refused as an ordinary result naming the section and the character delta; `removeSection` output names the removed section. |
| Superseded net reads leave context | Projection unit test: three reads in canonical history, context carries the latest body and two observation references; canonical entries `structuredClone`-equal. |
| Upload time falls with change size | Paid observation only: per-revision `outputTokens` and step duration from the F.6 chronology on a fresh Inventory run, compared with `run-SB5pgx` (p50 22.3 s, max 122.9 s, 322k argument characters over 46 calls). |

## Readiness ratchet

**Consumed:** Mission 7d WP-A–F — one upload per revision, evidence by text, sources by id, model-only net results, metadata policy, live pending channel, forward-only source, F.6 chronology.

**Carried from 7d to this cluster:** the WP-A.9 argument-projection probe becomes moot if argument size is proportional to change; drop it rather than run it. The self-referencing `markdownReference.retainedEntryId` in `compactToolCallArguments` is fixed or the code removed when the section model lands. `test:passage-policy` and `test:workpiece-evidence` are re-pointed to the operations input. The `acceptLive` contiguity check and the A.7 stale/failed discriminator on the recovery ledger stay carried unless the recovery contract change touches them. Also carried from the 7d review: `output.observation` is promoted in two places (`brunch-petrinaut-tools.ts` `execute` and the `clientToolResultOutput` hook in `mutation-record.ts`) — the hook is authoritative and the `execute` copy should go when the net-read contract is touched; the compaction summary drops `[message <id>]` lines, which matters once evidence cites ids across a compaction; the website `test:integration` suite has not been run on the 7d branch.

**Readiness gate after the new throughline:** Lu's timing review of a fresh thirty-minute Inventory run at medium reasoning — Ledger settlements within single-digit seconds at median, section structure preserved across the run, cached prompt under the compaction threshold at minute 30, and a legible net. Mission 7d's semantic acceptance rows remain the worked example's bar and are not re-owned here.

## Candidate evidence and oracles

- **Prompt growth (`run-SB5pgx`):** cached prompt 15.6k → 253k tokens in 27 minutes (vs 130k at minute 37 in `run-5uSidX`), then one Flue compaction to 15k at submission 77. Dominant source: 33 `read_petrinaut_net` results — 26 pre-compaction reads totalling ~309k characters (~40% of the prompt), the latest single read 19.3k characters for 17 places / 17 transitions / 19 parameters; stripping positions and null/false defaults saves ~13%, descriptions ~3k, the bulk is arcs and `lambdaCode`/kernel code. The skill's fresh-base discipline forces about two reads per construction step. Dedupe would leave ~25k of net text in context.
- **Ledger uploads (`run-SB5pgx`):** 46 `mutate_workpiece` calls (44 settled, 2 refused), 322k argument characters in total, all retained in context (argument projection default-off). Step p50 22.3 s; max 122.9 s during a provider throughput drop to ~29 tok/s (3,147 deltas, max inter-delta gap 1.9 s — generation, not a stall).
- **Ledger collapse (`run-SB5pgx`):** body lengths by revision: 3429, 7086, 7565, 9191, 9823, 11238, 11397, 13359, 14972, **7316**, 8267, 8831, 8706, 7768, 7894, 9041, 8197, 7146, 8354, 8076, 7966, 7118, **1725**, 2014, 2212, 2645, 2903, 2275, 2801, 2744, 2894, …, 6330. At revision 10 the model halved the document (dropped "Not yet established" paragraphs and the replenishment sequence); at revision 25 it collapsed to four flat sections (`Purpose`, `Established supply account`, `Production`, `Gaps and status`), losing the skill's section structure and the elicited/normalized/unknown distinctions. Declared evidence fell from 11–19 relations per revision to 1–3 from revision 17 onward and 1–2 after the collapse, so the carry rule (unchanged unique same-span text only) left nearly no provenance. Both collapses precede the compaction (cached prompt ~94k tokens at revision 10, ~220k at revision 25), so compaction is not the cause. The driver is established from the provider reasoning summaries (`assistant_reasoning_delta` events) on the two model steps before revision 10: the model weighs the token cost of re-uploading the full body, considers deferring the settlement, notes that dropping sections forfeits evidence it would have to re-declare, and then decides to write a condensed body of about 7k characters "instead of the huge version" — revision 10 landed at 7,316. The step before revision 25 has no reasoning text; its shape (net-construction burst → text reply → settlement on the next user turn) matches revision 10. Neither collapse was announced in the assistant text. No guidance asks for compactness, none forbids shrinking, and whole-document replace has no guard against a lossy rewrite. Both revisions immediately followed a net-construction step, and the net definitions read at those points are retained as `evidence/net-after-mutation-03.json` and `evidence/net-after-mutation-11.json`.
- **Rewinding `run-SB5pgx` to a pre-collapse point — assessed and rejected (2026-09-15):** `--resume` continues only from the end; a rewind would mean, on a copy, truncating `flue_conversation_stream_batches`, fixing the stream offsets and producer sequence, dropping later submissions and fold checkpoints, rewinding Flue's persistent workpiece state (location unverified), truncating the persona Pi session, and resetting the browser-profile net so its sha256 matches the last observation. Flue store invariants are unknown to us, an earlier truncation attempt (`run-K8TxLU`) failed, and MISSION.md forbids destructive history rewriting. The recoverable parts are the two net definitions above, loadable through the demo website's localStorage document path; the Ledger body at revision 9 exists in the stream but cannot be re-seeded without a model settlement. A fresh run with the stage-1 guard is the route.
- **Refusals (`run-SB5pgx`):** `evidence[6] matched 0 occurrence(s)` (mis-quoted its own Markdown) and `Evidence must resolve to an authorized true-user source` (cited a non-user id). Both recovered by resubmitting the same body with fewer relations (13 → 5, 7 → 2).
- **Compaction crossing (`run-SB5pgx`):** after compaction the model re-activated both skills, made one `read_workpiece { includeContent: true }` — the legitimate post-compaction reread — and continued with 14 settled revisions and further net mutations. Mechanism-level live recovery observed; semantic continuity not reviewed.
- **Latency floor (`run-SB5pgx`):** p50 time to first event 1.1 s; `read_petrinaut_net` steps 3.8 s, `mutate_petrinaut_net` 8.3 s, text 4.7 s; medium reasoning adds 5–15 s before the first tool delta on the larger steps.

## Verification approach

Inner: core unit tests for reconstruction, evidence resolution and deletion guards; projection unit tests for net-read dedupe and rendering. Middle: `history-retention` for the recovery contract across processes; loopback `test:persona` and `test:compiler-feedback` for the product route. Outer: one paid Inventory run on Lu's go, judged by the F.6 chronology and Lu's timing review; the panel colours by rendered capture.

## Risks and assumptions

- **Heading-keyed sections are stable enough to address.** If the model renames headings between revisions, `replaceSection` misses. Cheapest check: the skill's Ledger template fixes the top-level headings; refuse an unknown key with the current heading list in the refusal so the model self-corrects in one step. If misses dominate a faux run, fall back to heading-path plus ordinal.
- **The recovery contract can be re-earned without a second document authority.** If neither output nor persistent state can carry the body under the projection and reopen rules, stop: the token saving does not outrank recovery.
- **Dedupe of net reads does not starve the model.** The model needs only the latest definition and the observation identity of the base it cites; if a fresh run shows rereads despite a visible current body, treat that as the stop condition from 7d's argument projection.
- **The collapse was cost-driven.** Proven from `run-SB5pgx` reasoning summaries (see Candidate evidence). The residual risk is that stage 1 keeps the whole-body upload on every revision, so the guard fixes the content but not the settlement tax (p50 22 s at 15k chars). If that tax is unacceptable at demo scale, that observation promotes stage 2; do not pre-empt with turn counts.

## Accepted constraints and guarded invariants

- Revision identity, sha256 lineage, text-cited evidence, the `[message <id>]` id contract and `settleWorkpieceEvidence`'s carry rule are unchanged; the projection remains model-only and canonical/public history is untouched (Flue patch identity validation is the floor).
- A patch is an input form, never a second document authority; the reconstructed Markdown is the workpiece.
- Host `metadata` never reaches model context; anything the model needs is in `output`.
- Fresh-base discipline for `mutate_petrinaut_net` stays; the economy comes from what a read costs in context, not from skipping reads.
- Brunch is forward-only: no dual-input path keeping full-body `markdown` beside `operations` once the section model is proven.

## Expected touched paths

- `~ packages/core/src/{flue,update-workpiece,workpiece}.ts` and tests; `~ packages/core/src/skills/elicitation/SKILL.md`, `~ packages/core/src/prompts/SYSTEM.md`
- `~ packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`, `~ packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`, `~ packages/plugin-sdcpn/src/declared-basis.ts`
- `~ ../../../apps/brunch-agent/src/agents/chat-agent/context-projection.ts` and tests; `~ ../../../apps/brunch-agent/src/conversation/workpiece.ts`; `~ ../../../apps/brunch-agent/test/integration/history-retention.integration.ts`, `test/passage-policy*`, `test/workpiece-evidence*`
- `~ ../../../apps/petrinaut-website/src/main/app/local-storage-demo/brunch-tool-presentation.ts` and panel styling
- `~ docs/reference/architecture/flue-routing.md` (operations input, recovery source, net-read dedupe)

## Fog-line

- Where the reconstructed body lives for recovery: output once, persistent state, or both — decided by `history-retention`, not chosen in advance.
- Whether the model addresses sections reliably by heading, or needs a server-issued section id per revision.
- Whether net-read dedupe alone keeps a thirty-minute run under the compaction threshold, or the compact rendering is also needed.
- Whether stage 1 (guard plus guidance) holds the Ledger intact across a thirty-minute run, and whether its whole-body upload latency forces stage 2 before the demo.

## Stop or reorient

- Promote stage 2 when a stage-1 paid run shows an intact Ledger but settlement latency still not at demo scale; stop stage 1 if the guard repeatedly refuses legitimate user retractions.
- Stop the section model if a reopened process cannot reconstruct a revision with validated evidence from canonical records alone.
- Stop net-read dedupe if a fresh run shows the model rereading despite the latest body visible in context.
- Reorient to heading-path or server ids if heading-keyed operations miss in the faux run; do not add a full-body fallback.
- Return to Lu before any paid run.

## Carried evidence and rejected alternatives

- **Line-diff or anchor-quote patches — rejected.** Exact-quote fragility is already observed in the evidence refusals; sections are the unit the skill's template already names.
- **Argument projection of superseded bodies (7d WP-A.9) — superseded.** Proportional arguments remove the need; the probe is not worth its confounded input.
- **Turn-count or overdue-settlement mechanics — not re-entered.** `run-SB5pgx` showed no stall across 44 revisions after the WP-F.4 guidance; the remedy ladder's rung 2 stays closed.
- **A typed or slot-shaped workpiece — not re-entered.** The Markdown account remains the recoverable input; sections are addressed, not schematized. See [workpiece shape](../../MISSION.next.md#workpiece-shape).
