# Provenance, workpiece, and tooling decision log — 2026-09-04

> Design evidence, not execution authority. Compiled on 2026-09-04 from the owner conversation that reviewed the Mission 6 tie-off and the Mission 7 departure point. Every terrain claim below was checked against the checked-out code or the installed Flue 2.0.3 types during that conversation; each entry names what was inspected. Owner-settled items are policy accepted in conversation and must still be promoted into mission authority at the named cut before implementation. Recommendations are the agent's and remain open until the owner accepts them. The projection of this log into a reviewable design is [`provenance-by-lineage-mini-spec-2026-09-04.md`](provenance-by-lineage-mini-spec-2026-09-04.md).

Legend: **Settled** = owner accepted in conversation. **Recommended** = agent recommendation, not yet accepted. **Open** = fog; a probe is named.

## A. Mission 6 tie-off

**A1. Mission 6 deterministic layers are closed; the outer witness was blocked by an environment fault, not a product defect.** Settled as observation. Inspected: `docs/evidence/implementations/fe-1575-resumable-workpiece-petrinaut.md`; the shell's `ANTHROPIC_API_KEY` was the five-character placeholder `dummy`, which explains the recorded HTTP 401. Consequence: the outer two-tab witness, the cold-reader adjudication, and the product-manager demo remain open; the two human gates depend on the outer rerun because the model-produced revision does not yet exist. The Mission 6 builder is performing the rerun in a parallel session (untracked `fe-1575-outer-browser-witness-2026-09-04-r2/` observed in the worktree).

**A2. Mission 6 stacks on unmerged Mission 5.** Observation. `gt log short` shows `ln/fe-1574-direct-voice-flue` beneath this branch; GitHub PR 9528 is open awaiting review; Mission 5's human Voice witness is unrun per its evidence README. No PR exists yet for FE-1575. Consequence: Mission 6 cannot merge before Mission 5, and its close report needs a PR.

**A3. The prepared fixture's "Current Petrinaut correspondence" section is fixture-rigging.** Settled. Inspected: `prepared-crew-reservation-fixture.ts` versus `plugin-sdcpn/src/skills/sdcpn-modelling/templates/workpiece.md`; no template heading or skill directive produces such a section. Consequence: the Mission 6 fixture is a viability proof of transport, mutation, and resume, and must not be promoted into the provenance pair. The close report must say so.

**A4. The fenced-block workpiece source is a Mission 6 contract that Mission 7 will change.** Settled. The Mission 6 close report names the move from fenced `runbook-ir` blocks to an `update_workpiece` tool as a carried change so nobody treats latest-block selection as settled. Mission 6's implementation is not retrofitted mid-tie-off.

## B. Terrain: what exists between conversation, workpiece, and net

**B1. Flue history to workpiece revision: exists and is tested.** Inspected: `packages/core/src/workpiece.ts`. The resolver selects the tagged prepared signal or the latest assistant `runbook-ir` block, identified by source message id plus SHA-256.

**B2. Flue history to capture store: exists as a stub that re-indexes user utterances.** Inspected: `apps/brunch-agent/src/capture/apply-sweep.ts`, `packages/core/src/evidence/capture-store.ts`, `session-log.ts`. One envelope per user entry, excerpt equals the whole utterance, payload `{}`; excerpts resolve to a pointer of session id plus entry ordinal by substring search over an archived copy of history; the store adds an owner key, dedup, and idempotent retry. Everything but the owner key duplicates what Flue history already carries, under a second identity scheme. The store is a JSON file beside the sqlite database (`db-path.ts`).

**B3. Capture store to workpiece: does not exist.** Inspected: the workpiece template asks for "exact expert wording" as prose beside each claim and never names capture ids, message ids, or ordinals; Markdown has no passage identity. Settled: this is the central unresolved design tension, and it has been deferred as "later" without being stated in the spine.

**B4. Workpiece to net: one prose sentence in the fixture; no derivation record anywhere.** Inspected: fixture and template as in A3. Settled: a hand-authored derivation fixture, as the Mission 7 draft proposes, is useless and rejected.

**B5. Workpiece visibility: the workpiece is a black box during a conversation.** Inspected: the `runbook-ir` block streams as a fenced code block inside the assistant message; the only current view is the Mission 6 fixture banner's collapsed `<details>` element (`prepared-fixture-banner.tsx`). No pane, revision list, or diff exists.

**B6. Retained persona runs contain no revision series.** Inspected: every run under `docs/evidence/evaluations/` has at most one `runbook-ir` block; `vestera-runbook-headless` emits once at the end; Mission 4 v2 runs stopped before substance. Consequence: the model's revision cadence is unmeasured.

**B7. Petrinaut elements have no metadata slot; the file wrapper has only `title` and `meta.generator`.** Inspected: `petrinaut-core/src/schemas/entity-schemas.ts` (strict objects), `file-format/types.ts`.

**B8. Flue offers four typed ways to put something in the canonical log.** Inspected: `@flue/runtime` and `@flue/sdk` 2.0.3 `.d.mts`. Tool call records (input, output, call id; surfaced as tool parts on the assistant message with `turnId` and `submissionId`); `useDataWriter` data parts on the current response; `usePersistentState` `state_write` records, atomic with the tool batch, server-side only, not in `history()`; and signals via external `dispatch()` or `ctx.append` in finish hooks, surfaced as system-role messages with `tagName` and string attributes. There is no arbitrary custom entry and no tool-context `append`.

**B9. The construction tool schema carrier is still the one Mission 3 falsified.** Inspected: `plugin-sdcpn/src/tools/petrinaut-construction.ts` declares input as `v.looseObject({})` with a `rawTransform` that re-parses against Petrinaut's Zod schema, and pastes the canonical JSON Schema into the description text. Flue accepts Valibot only (`ToolInputSchema = v.GenericSchema`), converts via `@valibot/to-json-schema`, and rejects other Standard Schema vendors by checking `~standard.vendor === "valibot"`. The provider therefore sees an object with no fields. Flat `addArc` can survive on the description; nested `addType.elements` failed nine of nine in Mission 3. The spine already recorded "Flue Standard Schema support or a mechanical shape-preserving conversion" as the accepted next move; neither has been done.

**B10. Mounted tools today.** Inspected: `chat-agent/agent.ts`, `plugin-sdcpn/src/flue.ts`, `core/src/flue.ts`, `core/src/client-tools.ts`, website `local-storage-demo/`, persona `client-tool-hosts.ts`. Server: `ping`, Flue's `activate_skill`, `readPetrinautDoc` (browser-deferred, all SDCPN conversations), six construction tools (headless mode only), two fixture tools (Mission 6 mode only). Core owns no model-facing tool by stated rule. Client: the Petrinaut panel client-tool host; an `ask` interactive tool and `sweep` result handling that no mounted server tool ever produces; the Voice bridge, which is a transport rather than a tool; persona hosts `none`, `mock`, `real-headless`. The stock Petrinaut assistant exposes about fifty canonical tools.

## C. Design decisions

**C1. Provenance is recovered from lineage in the canonical log, not stored in a typed IR, a capture store, or a hand-authored derivation.** Settled in principle. Rationale: the typed comprehensive IR chased a receding horizon and degraded model performance; the structural swing left no seam; both treated provenance as a property of the domain model when it is a property of who changed what, in response to what, when. Every such moment is already recorded in Flue history once workpiece revisions and net mutations are tool calls.

**C2. The honest shape of a why answer is one creating call, one workpiece passage, one introducing revision, then either a quoted line or a short turn range.** Settled. The owner's correction: tool calls do not occur every turn and workpiece revisions do not occur every turn, so ranges enter at exactly one hop, the last. The verbatim quote check narrows a range to a line where the model quoted the expert. Elements changed several times show introducing and last-changing calls separately.

**C3. The why tool returns structured ranges; the assistant interprets.** Settled. The user asking "why" implies an assistant interpretation anyway, so the tool never authors prose and never invents a link. It must accept multiple element ids and return potentially several ranges per element.

**C4. Workpiece updates are tool calls, not fenced blocks in assistant text.** Settled. Tool: `update_workpiece`, input one Markdown string, `durable: true`, validates and hashes, writes the current-revision pointer with `usePersistentState` inside the same tool batch, returns revision and hash. Core owns the tool; plugins own the template. Rationale: structural revision identity (call id), write-time validation, agent access to its own current revision without model echo, lineage shared with mutation calls through `turnId`, and a clean UI split. Caveats recorded: token cost is unchanged and a structured-patch input is the later absorber; a model may call a tool less readily than it emits text, so cadence must be measured either way.

**C5. The generic lookup is a core `query_workpiece` tool; the element lookup is plugin-owned.** Settled for the split, name provisional. Core knows revisions and history, not Petri nets; it takes a revision pointer or passage locator and returns turn ranges with user text. Plugin-sdcpn owns a `locate_elements`-style lookup because only it knows which calls are mutations and where ids sit in inputs.

**C6. Net revisions join to workpiece revisions through the client-tool result, not through Petrinaut metadata.** Recommended. The browser returns the post-mutation document hash inside the client-tool result (Mission 6 already computes it for the settled manifest). A document hash no tool result explains is honestly "changed outside the conversation." A file-level pointer in Petrinaut `meta` is deferred until Mission 11 has a real consumer for a self-describing export.

**C7. The workpiece becomes a visible, revisioned document in its own pane.** Settled. Chat projects `update_workpiece` parts out of assistant messages, leaving a one-line marker; the pane shows current revision, revision list, and diff, driven from Flue history through the Mission 5 transport. Rationale: the chat pane is too small for artifacts; a why answer resolves to a passage the reviewer must be able to see; per-turn emission for the pane is the same behaviour that gives blame its grain. Projection lives in the app or transport layer, not the Petrinaut library.

**C8. The capture store and sweep earn no place in Mission 7.** Recommended. Flue history already carries message ids and exact text. Owner-key enforcement on evidence reads can be a check at answer time. The store re-enters only if verification strains under compaction or ownership.

**C9. The `ask` and `sweep` client handling is retired from code.** Settled. Surfaces: the two names in core `client-tools.ts` and the suspended ask contract behind them; the website's ask interactive tool and its test; the sweep filter in the panel transport and the sweep output module; the Voice references in `canonical-speech.ts` and `interview-coverage.ts`. Archived mission records remain the design reference. Vehicle: a subtraction commit under Mission 7 authority.

**C10. Petrinaut mutation tools are wired into ordinary conversation now, and admission is by evidence rather than by an inherited six-tool subset.** Settled as policy. The owner's judgement: continuing to defer tool wiring is a strategic mistake; the six were an unexamined side-quest set; the skill teaches concepts but not tool use. Terrain supports it: the subset lacks every `update*` and `remove*`, `getNetCompilationErrors`, `addScenario`, `applyAutoLayout`, metrics, subnets, and differential equations. Parity with the stock modeller is still not the goal. Mission 6's live constraint that construction tools stay out of ordinary conversations must be amended at the Mission 7 cut, not in the Mission 6 tie-off.

**C11. The schema carrier must be fixed before tools are admitted.** Recommended as the first act of the next cut. Options: a mechanical JSON Schema to Valibot interpreter for the subset Petrinaut uses (local, reversible, satisfies "mechanically derived"), or upstream Flue Standard Schema support. Petrinaut's canonical tool descriptions were written for the stock assistant and become useful field-level guidance once the carrier carries fields.

**C12. The skill must add construction posture, not just concepts.** Settled in principle. Read the definition first, mutate in small steps, check compilation errors, record each decision in Construction notes, call `update_workpiece` before and after construction.

**C13. Mission 7's release note narrows to the honest framing.** Settled. "Ask why about any element and see the workpiece passage, who prepared it, and the exact conversation line it rests on, or an explicit refusal." Rejected: inventing a longer conversation to make "what the expert actually said" true for prepared elements.

**C14. Mission 7 names local deployment posture; remote durability returns to Mission 8.** Settled. The owner reports the Postgres persistence move is slow and unresolved for local versus remote; it will not exist for Mission 7, so the sequence lines up with the original numbering.

**C15. The workpiece passage-identity question is decided by probe, not in a draft.** Recommended. Candidates: heading path (readable, breaks on rename), Markdown anchors (stable, changes the surface), companion manifest (clean Markdown, second-artifact drift). Probe: prepare references for the elements of one real pair, revise one non-semantic line, observe which scheme survives.

## D. Real honest fixtures through persona interviews

**D1. Real conversations and real workpieces replace prepared fixtures as the provenance pair.** Settled. The Mission 6 fixture stays a viability proof. Multiple persona runs can proceed in parallel; six cases already exist under `evaluations/cases/`.

**D2. Persistence during a run is the Flue store; retention is the harness's per-run evidence directory.** Observation. The harness's `--brunch-evidence-dir` already refreshes a canonical `snapshot.json` plus deterministic projections on every settled read. With `update_workpiece`, revisions become tool parts in that snapshot and the harness's workpiece recovery must read tool parts instead of fenced blocks.

**D3. How a retained real conversation becomes a live fixture is the first fog item of the persona programme.** Open. Options: keep the genuine conversation live in a durable store shipped with the demo; restore retained genuine records into a fresh store through Flue's storage adapter (records are genuine, only relocated, but the adapter's record types are private and the routing doc warns against consuming them); or replay the materialized snapshot as prepared signals, which turns genuine history into a prepared projection and would make the why route fixture-only. Probe: whether Flue 2.0.3 exposes or tolerates a conversation export and restore at the storage boundary.

**D4. Stop rule: a turn cap as budget plus a Brunch-side completion signal; ledger coverage grades afterwards.** Recommended. Today the turn budget lives only in the launch prompt and the persona is told never to end the interview. Proposed: cap per run (larger than the 6–10 used so far, cost accepted), stop early when Brunch itself declares construction handoff or delivery in its status section, and grade coverage against the hidden oracle ledger after the run rather than using it to stop.

**D5. Runs go to construction, because the fixture must contain lineage.** Recommended. Sequencing follows: carrier fix and tool admission and `update_workpiece` land before construction runs. An elicitation-only campaign can run earlier to measure revision cadence.

## E. Consequences for the planning record

**E1.** State the provenance tension in the spine as an open design decision with C1 as the current hypothesis, the typed IR and hand-authored derivation as rejected with reasons, revision cadence as the named strain, and the visible workpiece as the precondition.

**E2.** Re-cut the Mission 7 draft: drop the capture-store chain and Mission 2 inherited closure; make the carrier fix, orphan retirement, `update_workpiece`, the workpiece pane, tool admission and teaching, and the persona programme the mission's body; make the why route the last step over real lineage; name local posture.

**E3.** Adjust the Mission 9 and 10 drafts: they inherit the seam from lineage (revision id equals call id, passage identity per C15, element id, document hash per C6) and no longer assume a derivation fixture or prebuilt pair.

**E4.** Mission 6 close report: record A3 and A4 plainly, plus the credential cause in A1.

**E5.** Decision-integrity: every Settled item here is an owner decision expressed in conversation. It becomes authority only when written into the cut `MISSION.md` for Mission 7; this log and the mini spec are neither authority nor a substitute for it.
