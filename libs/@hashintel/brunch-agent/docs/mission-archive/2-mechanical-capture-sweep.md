# Mission 2 — mechanical capture sweep

## Status

Accepted 2026-08-27. Evidence of what was proven, not execution authority. Re-earn
before building on it, same as an ADR.

The live mission is [`MISSION.md`](../../MISSION.md). Successor clusters:
[`MISSION.next.md`](../../MISSION.next.md).

## Imperative

Re-enter durable, source-linked capture as a pipe, not as elicitation intelligence. Condition 5
showed the old kernel becoming untenable: typed mapping and in-loop LLM judgment, question turns
on the order of minutes. This mission proves that an explicit settled range can be applied into
the capture store and re-applied without duplication, without asking a model to extract, type, or
schedule. It does not improve extraction quality, and it does not feed an IR.

## Throughline

One harness-side pass over a real Flue conversation already on the Mission 1 door:

`settled Flue history range → harness apply-sweep → capture store keyed by Flue conversation identity → same range applied again → same capture identities`

On the same production agent, mount one stub Flue skill (`useSkill`) so `activate_skill` can
appear in that conversation's history. The skill is not a runbook and not the IR template.

The interviewer does not call a sweep tool and does not decide when to sweep. A test or harness
fact names the range. Stub extraction: one envelope per user utterance, quote = that text,
payload `{}`.

## Proof

This proof establishes that the capture pipe works on the live chat path. It does not establish
extraction quality, a typed IR, a runbook, session-as-net, or two brains.

From the real brunch-agent entrypoint (same `ChatAgent` / `/api/chat` door as Mission 1), one
production-path test observes all of the following:

1. After an explicit settled range, apply-sweep writes capture envelopes with evidence spans and
   empty payload, one per user utterance in that range.
2. Applying the same range again yields the same capture identities and does not duplicate.
3. The stub skill is mounted; `activate_skill` appears in Flue history for that conversation.
4. The interviewer never called a sweep tool; producing the captures did not require a model
   call.

Prefer that one throughline test over a broad suite. Unit tests may pin envelope/idempotency
invariants that failed or proved easy to regress.

This proof does not require a human panel run unless the throughline cannot be observed from the
service entrypoint the demo uses.

## Constraints

- Mission 1's chat door stays the door: Petrinaut panel → `transport-aisdk` → Flue `ChatAgent`.
  Do not rewrite the panel onto `@flue/react`. The adapter still must not depend on core,
  binding, or plugins.
- The app may depend on core (and binding, if that is the smallest way to `apply-sweep`) for
  this pipe only. Do not re-enter plugin-gherkin, plugin-sdcpn, repertoire, kinds, slots, fold,
  completion, issues, or correction.
- No extraction LLM. No sweep tool on the interviewer. No token-threshold observer.
- No join to a runbook or IR template. Capture is a provenance ledger, not the workpiece.
- Flue history remains the conversation log. The capture store is not a second transcript.
- Key the store by the Flue conversation identity already in play (principal + conversation id).
  If a later Host proof shows net ids unstable, rekey; do not invent a target-document.
- One stub Flue skill, short enough that activation is the proof. Do not dump research into it.
- Update runbook/docs only where exercised behavior changes.

## Fog-line

Do not design past these questions before running the simplest path that can answer them:

- Whether `apply-sweep` is in-process in the app, via binding-flue, or a thinner local call into
  core; pick the smallest path that uses the real store.
- Whether a trivial proposal schema is required for an empty payload, or the harness can persist
  envelopes without a plugin catalog.
- Where the capture files live relative to the Flue SQLite conversation (path, not ontology).
- How the stub skill is declared (`SKILL.md` import vs `defineSkill`) so `activate_skill` shows
  in `history()`.

Resolve each at the real boundary, record the observed answer in code/tests, and then
re-evaluate. Do not turn them into a capture framework or a plugin SDK revival.

## Stop or reorient

Stop and surface the evidence before continuing if:

- producing captures requires a model call;
- a sweep tool appears on the interviewer, or the skill teaches the model to schedule sweeps;
- kinds, slots, fold, repertoire, or the SDCPN/Gherkin plugins re-enter this door;
- the runbook or IR template is wired to the store;
- an ordinary turn on this path returns to condition-5 latency (order-of-minutes);
- idempotent reapplication cannot be shown without a second event model beside Flue history;
- the adapter grows a dependency on core, binding, or plugins.

## Deferred

Host trunk (two brains, net lifecycle as session, compaction), the runbook/template/headless and
off-canvas PN path, Petrinaut read/write tools, typed IR maps, observer-triggered sweeps, and
whether capture and runbooks converge, are clustered in [`MISSION.next.md`](../../MISSION.next.md).
That scratchpad does not supersede this section.

## Close

Witnessed 2026-08-27 on `ln/fe-1524-mission-2` (Linear FE-1524). Production-path test:
`apps/brunch-agent/test/petrinaut-chat.test.ts` driving
`apps/brunch-agent/test/petrinaut-chat.integration.ts`. The GitHub PR from this branch is the
review record.

### Proof

1. After one user utterance, harness `applyCaptureSweep` wrote one envelope whose excerpt is that
   text and whose payload is `{}`.
2. Applying the same named user-entry ids again returned the same capture ids and a non-empty
   `skippedDedupKeys`; no second row was minted.
3. `defineSkill` / `useSkill` mounted `confirm-path`; faux-scripted `activate_skill` with
   `{ name: "confirm-path" }` appears in Flue `history()` and in the AI SDK stream.
4. Interviewer tools were `activate_skill`, `ping`, and `readPetrinautDoc`. No `sweep` /
   `brunch_sweep`. Stub proposals are built from history text in-process; producing captures did
   not require an extraction model call.

### Fog-line answers

- **apply-sweep home.** In-process in the app via binding-flue:
  `createLocalCaptureStore` + `createFlueHistoryReader` + `store.execute({ type: "apply-sweep" })`.
  Not `useElicitation`, not HTTP, not `useAgentFinish`. Evidence-bearing apply requires the
  history reader to archive quotes before execute. Session id for that archive is the Flue
  instance id.
- **Empty payload.** `{}` persisted with the existing `CaptureInputProposalSchema`. No plugin
  catalog and no trivial proposal schema were required.
- **Capture path.** Sibling of the Flue sqlite file, named `<flueInstanceId>.json`. The hermetic
  test writes beside `BRUNCH_CHAT_DB_PATH`. Internal JSON is still binding's
  `TargetDocumentRecord`; the app API does not expose a target-document ontology.
- **Skill declaration.** `defineSkill` + `useSkill` is enough for `activate_skill` to appear in
  `history()` under `node --experimental-strip-types`. `SKILL.md` / Vite skill import was not
  needed.

### Carried flags

- Capture remains a provenance ledger with empty payloads. Typed payloads, token-threshold
  observers, and any join to a runbook or IR are not proven and stay on the scratchpad.
- Store key is Flue conversation identity (principal + conversation id). Net id as discriminator
  is still the unproven Host-trunk assumption from Mission 1.
- The interviewer still must not own sweep scheduling. Mission 3's runbook/template path must
  not wire itself to this store in order to tidy the list.
