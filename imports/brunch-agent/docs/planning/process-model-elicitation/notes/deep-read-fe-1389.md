# Deep-read: FE-1389 — Walk free-text replies through the real harness

Deep-read of commit 81e9ce0 (branch `ln/fe-1389-walking-skeleton`, PR #10), produced during the
remediation sweep (FE-1401) as one of three outputs: this builder's account + spec-discharge
note, the commit-message backfill (applied to the branch), and rows for the convergence trace.
Agent-authored under instruction; reviewed before landing.

Files read (all paths as of 81e9ce0):

- `packages/binding-flue/src/index.ts`
- `packages/core/src/affordance.ts`
- `apps/dev/test/walking-skeleton.integration.ts`
- `apps/dev/test/walking-skeleton.test.ts`
- `apps/dev/src/ui/chat.tsx`
- `apps/dev/src/routes.ts`
- `apps/dev/src/app.ts`
- `test/boundaries.test.ts`
- `test/known-gaps.ts`

---

## Builder's account

### The problem

Before this commit the ask tool was an admitted placeholder: `askTool` was a `defineTool` whose `run` threw `'The ask tool is scaffolding: turn suspension and reply binding land with the walking skeleton (FE-1389).'` (Observed — removed hunk in `packages/binding-flue/src/index.ts`). The seam existed — tool name derived from core's abstract operation, Valibot input — but the system could not hold a conversation: no suspension, no pending slot, no reply binding. The dev app's UI was literally `<main>Elicitation harness — dev app</main>` (Observed, `apps/dev/src/ui/main.tsx`).

So the problem is the one CONTEXT.md calls a **walking skeleton**: prove that the whole suspend-for-reply transport — capability 5, the one Flue does not provide and the binding must absorb (spec §10) — actually works on the real substrate, end to end, with stubbed internals, and prove it in a way CI can re-run without a model key or a network.

### Why it's shaped this way

Three prior findings constrain the shape, and every design choice here traces to one of them:

1. **Ticket 10's clobbering finding** (issue 10 §1): writes to the fixed data channel materialize last-write-wins per assistant message. So the channel cannot be the durable record. Spec §7.3 rules that durable identity and payload ride the ask tool's *output part*, and the channel write is live-render sugar.
2. **Ticket 10's wake wart** (issue 10 §4): interpolating pending state into instructions triggers Flue's "System instructions updated" advisory, waking the model for a wasted turn per ask. Spec §7.4 (adjudication C7) rules: no interpolation.
3. **Ticket 13's anchoring finding** (issue 13 §2, HITL round 1): the model's verbatim quotes are flawless and its identifier guesses never converge. So reply binding must be harness-mechanical, not model-remembered — no echo token.

The result is that `useElicitation` (spec §12.1 names this exact function) does four things at once, and each is one of those constraints made mechanical.

### How it works, concretely

**The durable pending affordance** (Observed, `packages/binding-flue/src/index.ts:59-85`). The ask tool mints an affordance whose id is `affordance_${toolCallId}` — derived from Flue's own tool-call id, so identity is anchored to the substrate's unit of work rather than to a counter the binding would have to persist. It returns `{ output: affordance, terminate: true }`, with `output: FreeTextAffordance` declared on the tool, so Flue validates the payload onto the tool output part — the durable surface §7.3 blesses. `writeAffordance(affordance)` then writes the same value to a data channel named `'affordance'` (`useDataWriter('affordance', { schema: FreeTextAffordance })`, line 44), which is the live-render copy the UI reads. The channel name is vocabulary-correct: CONTEXT.md retires "exchange", and ticket 10's channel was `data-exchange`.

**The one-live-affordance rule, as mechanism** (Observed, lines 73-80). The check is written as a `setPending` *updater*, not as a read of the `pending` value from the render closure — and this is the load-bearing subtlety of the whole file. Both ask calls in a single tool batch execute against the same render, so both see the same closed-over `pending` (null). Only the updater sees the value the first call just wrote. So the updater form is what makes the reject-second-ask rule actually fire within a batch; a read-then-check would silently permit exactly the case ticket 10 forced by hand. (Inferred, from Flue's render-per-model-call semantics; Observed that the integration test asserts the rejection does fire, which is the empirical confirmation.)

**No interpolation, therefore no wake** (Observed, lines 87-91). The returned instruction string interpolates only `plugin.targetDomain` and `toolName('ask')` — both render-invariant. The pending affordance appears nowhere in it. Since Flue's advisory fires when the instructions (or tool set) change between turns, and neither can change here (the tool set is a single unconditional `useTool`), state writes cannot produce a wake. That is the causal mechanism by which §7.4's ruling delivers the fix, and it is why the test's `noInstructionWake` property is expected to hold rather than hoped to.

**The suspend/resume path** (Observed, lines 46-57). `terminate: true` ends the response. The person's reply arrives as a fresh dispatch. `useAgentStart` fires, guards on `delivery.kind === 'user' && pending !== null`, clears the slot, and `ctx.append`s a `kind: 'signal'` entry typed `affordance-reply-bound` whose body states that the immediately preceding user message is bound to the pending affordance, quoting that affordance's markdown and carrying its id in `attributes`. Two spec obligations are discharged in that one call: §7.4's "any fact the harness owns reaches the model through tool results or signals, not only through instruction text", and §9.4's provenance rule, since Flue signals project structurally non-user (ticket 13 §3) and so can never be cited as capture evidence.

**Hermeticity of the proof** — this is the most interesting engineering in the branch. Flue's own docs (quoted in `docs/inbox/amp-analysis-flue-vs-tilde.md`) present two mutually exclusive eval modes: in-process `start()` exercises the agent but *needs provider credentials*; HTTP via `@flue/sdk` exercises the agent plus `app.ts` routing but *needs a running server*. The test takes the coverage of both and the cost of neither (Observed, `apps/dev/test/walking-skeleton.integration.ts`):

- `start({ agents: [GherkinElicitor], providers: [faux.provider] })` boots the real runtime in-process, with `@earendil-works/pi-ai`'s `fauxProvider` registered under `provider: 'anthropic'`, model `claude-haiku-4-5` — shadowing the real provider the agent's `useModel` names, so no credential and no network egress. Responses are a scripted array, one of them a function that captures the live `Context` for inspection.
- `createFlueClient({ url: 'http://brunch.test/agents/gherkin/<uuid>', fetch: fetchApp })` where `fetchApp` calls `app.fetch(new Request(...))` directly (lines 49-57). No socket, no listener, no DNS: `brunch.test` exists only to make the URL absolute. The real Hono app and the real `createAgentRouter` mount are in the path, so route wiring is genuinely covered.
- `start()` is called with **no `db` option**, so conversations are process-memory (Flue's documented behavior: "omit it for in-memory state"). The dev app's `apps/dev/src/db.ts` sqlite adapter is a build-time convention file and is not reached by the explicit `start()` config — so the test touches no disk (Inferred, but consistent with `apps/dev/src/db-path.ts`'s own note that the adapter module "cannot be driven under `bun test`").
- Conversation id is a fresh `crypto.randomUUID()` per run, and `finally { await flue.stop() }` tears the runtime down.
- The whole thing runs as a child `node --experimental-strip-types` process spawned by `apps/dev/test/walking-skeleton.test.ts`, which asserts on a single `WALKING_SKELETON_RESULT <json>` stdout line via one `toEqual` over all five properties. The child-process shape keeps a booted Flue runtime out of the `bun test` process (Inferred: `db-path.ts` records that `@flue/runtime/node` "cannot be driven there").

The five asserted properties: the bound reply text and the `affordance-reply-bound` tag both reached the model's context; the first affordance survived on the tool output part with `"form":"free-text"`; the data channel carried the question; no `instructions updated` advisory appeared anywhere in history; and in a two-ask batch exactly one call is `output-available` and exactly one is `output-error`.

### What a newcomer would misunderstand

- **That `routes.ts` is a regression.** The old `apps/dev/src/app.ts` comment said the mount path "derives from the pinned identity — a copied literal here would let a second agent shadow this mount". The new code mounts at a separate literal `'gherkin'`. This is not a loosening: `apps/dev/src/ui/chat.tsx` runs in the browser and needs the mount path, and importing `gherkin-elicitor.ts` to read `.agentName` would drag `'use agent'` and `@flue/runtime` into the client bundle. `routes.ts` is the one shared constant both call sites import. The boundary check that mattered — `test/boundaries.test.ts:305` "a pinned identity appears only in its own agent module" — still holds, and storage still keys on `brunch-gherkin-elicitor`, as the new comment says. (Observed + Inferred on the motive.)
- **That the pending slot is the durable record of the affordance.** It is not, and deliberately: it is cleared on the very dispatch that answers it. Durability lives on the tool output part (§7.3). The slot is a *lock*, not a log — it exists to make "at most one pending" true so that binding can be mechanical.
- **That the reject-second-ask check reads state.** It writes it. See above; a reviewer who "simplifies" the updater into `if (pending !== null) throw` silently deletes the guarantee, and only the integration test would catch it.
- **That `markdownFloor` in the test proves the markdown floor.** It proves the data channel carried the question text. The actual §7.2 floor property — an unknown form still renders because the envelope carries markdown — is not tested, and as implemented the UI *fails* it (below).
- **That the app's `import.meta.env?.DEV === false` inversion is paranoia.** Under plain node there is no `import.meta.env`, so `import.meta.env.DEV` throws the moment the integration test imports `app.ts`. The inversion is what makes the app importable outside vite.

### Where it is thin, brittle, or unresolved

**Genuinely bug-shaped:**

1. **At-least-once tool re-execution is misreported as a duplicate ask.** Ticket 13 §4 records Flue's at-least-once tool re-execution as a hard fact, which is why spec §8.3 makes content-keyed idempotence "load-bearing, not optional". The affordance id is deterministic in `toolCallId`, so a re-execution mints the *identical* affordance — but the guard tests `current !== null`, not `current.id !== affordance.id`. A retried ask therefore throws "An interactive affordance is already pending", turning a benign retry into a spurious rejection of the model's own question. One-line fix; worth naming before the settlement trigger starts causing re-executions.
2. **The UI drops unknown forms instead of falling back to markdown.** `apps/dev/src/ui/chat.tsx:30-31` does `v.safeParse(FreeTextAffordance, part.data)` and `return null` on failure. `FreeTextAffordance` validates `form: v.literal('free-text')` and the concrete `payload`, so the *first* single-choice or plugin-custom affordance to arrive renders as nothing at all. Spec §7.2 and §7.7 both require the opposite: the markdown floor exists precisely so "a ui that knows only the envelope renders everything", and ticket 10 §5 proved that behavior. The floor needs an envelope-only schema (id/form/markdown) with the payload opaque; today one closed schema does both jobs.
3. **No escape from an occupied slot.** The slot clears only on a `kind: 'user'` delivery. If a reply never comes, every subsequent ask is refused forever and nothing reports the fact. Spec §7.5's `unanswered` outcome and §8.6's unaccounted-ask advisory are the intended relief valve; neither exists yet.

**Thin, in the honest walking-skeleton sense:**

4. **The harness shell is empty; the mechanism is all in the binding.** `packages/core` contributes two Valibot schemas (`packages/core/src/affordance.ts`) and `toolName`. Everything else — the affordance id scheme, the reject-second rule (a *harness* invariant per §7.3), the reply-binding narration, the instruction assembly — lives in `packages/binding-flue/src/index.ts`, whose own header invokes the second-binding test (§14.2) against exactly this. A `binding-pi` would re-implement all four, and the only Flue-specific parts are the five hook calls. This is the single largest architectural debt the branch creates, and the file's docblock is aware of it.
5. **`targetDomain` is interpolated raw into the prompt.** `'You are interviewing someone to elicit gherkin.'` — because `plugin.targetDomain` is `'gherkin'` (`packages/plugin-gherkin/src/index.ts`). This is the first place plugin data reaches the model, and it arrives as an unadorned slug. §11.1 plugin ownership wants a human phrase here.
6. **One session per target-document, everywhere.** `chat.tsx:8` computes `conversationId` at module scope and line 68 derives `targetDocumentId: dev-${conversationId}`, so every page load opens a new session against a brand-new document. The integration test pins the document id but randomizes the conversation. The §9.1 property that actually matters — many sessions resuming against one target-document — is unreachable from either surface.
7. **The kickoff message is a machine-authored *user* entry.** Both `chat.tsx:67` and the test send `{ kind: 'user', body: 'Begin the interview.' }`. Per §9.4 only true user entries are citable as capture evidence — and this one is structurally a true user entry that no user typed. Harmless until sweeps land; then it is an anchorable non-utterance. The correct carrier is the signal channel this branch just built.
8. **No user-visible insertion notice.** The `affordance-reply-bound` signal projects `display: 'diagnostic'` (ticket 13 §3) and `chat.tsx:11-16` filters it out. §9.3 requires "a minimal user-visible insertion notice accompanies every injected state message"; this is the first injected entry in the system and it ships silent. Scoped to briefings in the spec's letter, so not yet a violation, but the same code path will owe it.

**Brittle oracles** — and the repo already knows: `docs/planning/refactor-queue-2026-08-14.md` item 2 names the faux-provider marker comment specifically.

9. **`noInstructionWake` is a case-insensitive substring absence over `JSON.stringify(history.messages)`.** It matches Flue's advisory *phrasing*. If Flue rewords the advisory, the check passes forever while the wart is back — and this check is the one that deletes the `wake-wart-residue` entry from `test/known-gaps.ts`.
10. **`boundReplyReachedModel` under-asserts the binding.** It is two substring tests over the stringified context. It does not check that the signal carries the *right* `affordanceId`, that it quotes the *first* question rather than the second, or that it sits adjacent to the user message. The property "the correct affordance was bound" is not actually pinned.
11. **The faux provider's model id is a silent coupling.** `{ id: 'claude-haiku-4-5' }` must match `useModel('anthropic/claude-haiku-4-5')` in `apps/dev/src/agents/gherkin-elicitor.ts`. Nothing ties them. Change the agent's model and the test either falls through to a real provider or fails obscurely; `test/boundaries.test.ts`'s model-key scan would not notice an attempted network call.
12. **The hermeticity gate was weakened to a comment.** `test/boundaries.test.ts:424-433` changed from "no test imports the substrate, ever" to "substrate imports are allowed in `*.integration.ts` files containing the string `hermetic-substrate-test: faux-provider`". Any future file can claim hermeticity by copying a comment.

---

## Spec discharge

| Obligation | Status | Evidence / gap |
|---|---|---|
| §10 cap. 1 register a tool | **full** | `useTool` at `binding-flue/src/index.ts:59` |
| §10 cap. 2 contribute instructions | **full** | render return, lines 87-91 |
| §10 cap. 3 persist per-conversation state | **full** | `usePersistentState('pendingAffordance')`, line 40 |
| §10 cap. 4 emit an affordance payload | **full** | both surfaces: `useDataWriter` (44) + `output` on the tool (64, 83) |
| §10 cap. 5 suspend-for-reply (**absorbed**) | **full** | `terminate: true` + pending slot + fresh dispatch, all three present and proved |
| §7.3 durable identity/payload on the tool output part | **full** | `output: FreeTextAffordance`; test property `durableOutput` |
| §7.3 channel is live-render sugar, not a log | **full** | channel write is secondary and unread by the durability assertion |
| §7.3 reject a second interactive affordance per batch, **as mechanism** | **full** | updater-form guard (73-80); test property `secondAskRejected` (1 available + 1 error) |
| §7.4 no instruction interpolation of the pending question | **full** | instructions are render-invariant; test property `noInstructionWake` |
| §7.4 pending affordance narrated in the ask tool's result | **full** | the affordance *is* the tool output |
| §7.4 harness-mechanical reply binding, no echo token | **full** | `useAgentStart` slot-clear + signal (46-57); test property `boundReplyReachedModel` |
| §7.4 harness facts reach the model via tool results or signals | **full** | `kind: 'signal'` carrier |
| §7.7 outbound rich / inbound string-only | **full** | Valibot-validated data part + tool output; replies are bare strings |
| §7.7 the UI must filter on `purpose`/`display` | **full** | `chat.tsx:11-16` |
| §9.2 pending-affordance slot as one of exactly three per-session items | **full** | the slot exists and is the only per-session state added |
| §9.4 injected entries structurally non-user | **full** | signal carrier, per ticket 13 §3 |
| §12.1 host calls `useElicitation(plugin)` | **full** | `gherkin-elicitor.ts:29` |
| §12.3 tool names identity-not-function | **full** | `brunch_ask` via `toolName('ask')` |
| §12.5 CI smoke with no model key, no network, no flake | **full** | faux provider + `fetch` shim + no `db`; gate weakened per note below |
| §14.5 wake-wart residue | **partial** — ledger says closed | Proved for the *one* instruction-state write path that exists. §14.5 asks that "no **other** instruction-state write path re-triggers advisory wakes"; there are no others yet, and the gap entry was **deleted** from `test/known-gaps.ts`, so the high-water mark and settlement-trigger write paths will land unchecked. |
| §7.2 three baseline forms + questionnaire chaining | **partial** | free-text only, by design |
| §7.2 markdown floor | **partial / contradicted in the UI** | schema carries `markdown` (correct); `chat.tsx:30-31` validates the *whole concrete form* and returns `null` on mismatch, so an unknown form renders nothing — the opposite of the floor, and of ticket 10 §5's proved behavior |
| §7.2 plugin payloads opaque at the tool boundary (`v.any()` in typed envelope) | **touched, not discharged** | `payload: v.object({ question })` is concrete; there is no envelope/payload split yet, so the opaque waist is unbuilt |
| §5.1 reserved reply encoding for structured taps | **touched, not discharged** | UI sends bare text; §5.1 explicitly makes taps optional, so no violation — absences from this UI would honestly be `inferred` |
| §7.5 transport outcomes `answered / redirected / unanswered` | **touched, not discharged** | binding clears the slot and binds unconditionally; no outcome is recorded anywhere |
| §7.6 interpretation render | **untouched** | still open as `interpretation-render-plugin-seam` in `known-gaps.ts` |
| §9.1 many sessions, one target-document | **touched, not discharged** | `chat.tsx:68` derives a fresh document id per page load |
| §9.3 re-entry briefing (+ user-visible insertion notice) | **touched, not discharged** | the signal carrier is now proved; no briefing, and the one injected signal is filtered out of the UI |
| §14.4 generation-first fixtures over a deterministic replay driver, `fc.commands` | **untouched** | the proof is one hand-scripted linear sequence |
| §14.1 all ten harness invariants | **untouched** | every one is a capture-store property; no capture store on this branch |
| §14.2 five proof obligations; smallest-honest-plugin | **partial** | smallest-honest holds (plugin surface unchanged, only `targetDomain` read). Controlled elicitation is advanced. **The second-binding test is failing in spirit** — see below. |
| Issue 10: one-channel multiplex, amended | **full** | channel + tool-part split implemented exactly as amended |
| Issue 10: update-in-place vs append | **full (inherited)** | settled by the prototype; this branch depends on it rather than re-proving |
| Issue 10: echo token not needed | **full, superseded** | replaced by the stronger mechanical binding of §7.4 |
| Issue 10: turn suspension + wake wart | **full** | suspension proved; wart eliminated at its cause |
| Issue 10: rendering ergonomics | **partial** | `purpose`/`display` filtering yes; markdown fallback for unknown forms **no** |
| Issue 13 cap. 1: settlement trigger (`useAgentFinish`, loop guard, pending guard) | **untouched** | no `useAgentFinish`; the pending guard the trigger needs is the very slot this branch built |
| Issue 13 cap. 2: read the durable entry projection over self-HTTP | **touched, not discharged** | the *test* reads `client.history()`; the **binding** has no history reader. `history-projection-paging` remains an open gap. |
| Issue 13 cap. 3: inject typed non-user signal entries | **full** | `ctx.append({ kind: 'signal', … })`, same-response form |
| Issue 13 cap. 4: transactional durable store outside conversation state | **untouched** | lands on `ln/fe-1390-capture-store` |

### Contradictions and vocabulary notes

- **The markdown floor, in the UI.** The only substantive contradiction. `chat.tsx` implements form-specific parsing where §7.2/§7.7 require an envelope-level floor. It works today because one form exists, and it will silently blank the screen for the second one.
- **The second-binding test is failing in spirit** (§14.2, and the docblock at `binding-flue/src/index.ts:9-11` asks the question itself). Harness mechanism — the id scheme, the §7.3 one-live-affordance invariant, the binding narration, the instruction assembly — is entirely inside `binding-flue`. `packages/core` holds two schemas. Spec §12.2 names `packages/core` as *the harness*; on this branch the harness is a schema bag.
- **CONTEXT.md defines "walking skeleton" as a prototype** ("proves a transport or integration end-to-end on the real substrate … with stubbed internals"). Here it names a permanent CI test in the shipped tree (`apps/dev/test/walking-skeleton.test.ts`). The referent has quietly migrated from throwaway-on-a-`prototype/*`-branch to durable-gate. Not wrong — arguably better — but the glossary no longer describes what the word points at, and CONTEXT.md is the authority.
- **CONTEXT.md lists "core" under *Avoid* for the harness shell**, while spec §12.2 names the package `packages/core`. Pre-existing, not introduced here; noting it because this commit is where core's public surface first grows beyond naming.
- **`FreeTextAffordanceValue`** (the `type` alias re-export at `packages/core/src/index.ts`) exists only to disambiguate the schema constant from its inferred type. "Value" is not glossary vocabulary and it will multiply once the other two baseline forms land.

---

## Commit-message backfill

Title unchanged: `FE-1389: Walk free-text replies through the real harness`

```
Suspend each ask on a durable pending affordance and mechanically
bind the next dispatch, with a hermetic end-to-end dev-app proof.

The ask tool was a seam that threw. useElicitation now mounts the
whole suspension protocol Flue makes the binding absorb: the tool
mints a free-text affordance keyed to its own tool-call id, returns
it as the tool's output part — durable, where the data channel is
only last-write-wins per assistant message — and terminates the
turn. The one-live-affordance rule is mechanism, not instruction,
and it has to be written as a state updater rather than a read:
both calls in a tool batch see the same render, so only the updater
lets the second ask find the first and refuse it.

Nothing interpolates the pending question into the instructions, so
the instruction string is render-invariant and no state write can
change it — which is what removes the cause of ticket 10's
"instructions updated" advisory and the wasted turn per ask. The
reply arrives as its own dispatch: agent-start clears the slot and
appends an affordance-reply-bound signal quoting the question, so
the model receives the binding as a harness fact instead of
remembering an id, and the signal projects non-user so it can never
be cited as evidence.

The dev app is now the proof. The integration test drives the real
runtime and the real Hono app through a fetch shim into app.fetch —
no socket, no db adapter, so conversations stay in process — with
pi-ai's faux provider standing in for the model. It reports five
properties on one line and bun test asserts them together: the
bound reply and its signal reached the model's context, the
affordance survived on the tool output part, the channel carried
the markdown, no advisory wake appeared anywhere in history, and a
two-ask batch left exactly one call answered and one errored. That
retires the wake-wart-residue gap; the boundary suite now admits
substrate imports only from marked .integration.ts files.
```

---

## PR body

This turns the ask seam into a working turn-suspension protocol: the tool mints a free-text affordance, parks it in the pending-affordance slot, returns it on the tool output part where its identity is durable, and terminates the turn — then the next user dispatch clears the slot and gets bound to that affordance by the harness itself, announced to the model as a signal rather than left to the model's memory. Because the pending question is never interpolated into the instructions, the instruction string cannot change between turns, which is what removes the wasted "instructions updated" wake turn the ticket-10 prototype hit once per question. The dev app is the proof: a chat UI plus an integration test that boots the real Flue runtime and the real Hono app in one process, drives them over a fetch shim with a scripted faux provider, and asserts in one shot that the reply binding reached the model, the affordance survived durably, no advisory wake appeared, and a second ask in the same batch was refused.
