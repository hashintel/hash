# Walking skeleton: Flue question round-trip

Type: prototype
Status: resolved
Resolved: 2026-08-07
Blocked by: 05

## Question

Does the one-channel questioning transport hold up in a real Flue agent + web UI? Build a walking skeleton — real Flue agent, minimal elicitor stub (no plugin), one question round-trip: structured ask affordance emitted via a single kernel-owned data channel (`form` tag + markdown-baseline payload), answer returned as string dispatch, interpretation recorded to the session.

Proves or refutes (proof obligations delegated from the Questioning-UX contract, issue 05):

- The **one-channel multiplex** working hypothesis: one fixed `data-exchange` channel, forms discriminated inside the payload, plugin widgets as progressive enhancement.
- The **data-part update-in-place vs. append** contradiction in Flue's docs (hooks reference says in-place; streaming protocol + `AgentReply.data` say append) — runtime check.
- Whether a reply needs an **echo token** binding it to the question asked, or whether transcript adjacency + agent interpretation suffice.
- What the **turn-suspension protocol** actually needs to persist (`terminate: true` tool + fresh-dispatch answer) — and how a cancelled/redirected question reads back from the session.
- UI-side **rendering ergonomics**: branching on the form tag, markdown fallback for unknown forms, `purpose`/`display` filtering of non-user-facing traffic.

## Answer

> Resolved by walking skeleton, 2026-08-07. Real Flue agent (`@flue/runtime` 2.0.3, vite 8, Node target, no db) + React UI (`useFlueAgent`), driven live over multiple conversations: full round-trips through single-choice, free-text, an unknown form, absence-strip taps, and a redirect. Prototype captured on branch **`prototype/10-flue-roundtrip`** (`prototypes/flue-roundtrip/` — README documents the probes; `probe-stream.mjs` is the SSE-level evidence).

**Overall: the transport holds — with one load-bearing amendment.** The one-channel questioning transport survives contact with the real runtime, but the fixed data channel is a *one-live-affordance slot per message*, not an accumulating log, so affordance **identity** must ride the ask tool's output part, not the channel.

### Verdict per proof obligation

1. **One-channel multiplex: PROVEN, amended.** One `data-exchange` channel carried three forms (single-choice, free-text, and the deliberately unknown `rating-stars`); the UI branched on the `form` tag, rendered widgets for known forms and the markdown floor for the unknown one, and reply transport stayed string-only throughout. **The amendment:** writes to one channel name materialize *last-write-wins per assistant message* — forced two `ask_user` calls in one turn, and the first question's affordance was silently clobbered from the durable record (both `dynamic-tool` parts survived, with inputs and validated outputs). So: the channel is a "current affordance" surface; per-ask identity and payload belong on the ask tool's `output` (Flue's React docs bless exactly this — tool output parts exist "so applications can render custom tool interfaces"). A kernel invariant follows: **the ask tool must reject a second ask in the same batch** (mechanism, not instruction — the stub's instruction-level "one question at a time" held until deliberately overridden, but the guarantee belongs in the tool).
2. **Update-in-place vs append: SETTLED — update-in-place, at every layer.** The hooks reference wins; the streaming protocol's "append" describes delta chunks, not part materialization. Evidence: two same-channel writes (`draft` → `open`) produced two SSE deltas but every snapshot held exactly one part; durable history holds one part (final value); even `readSubmissionReply`'s "emit order" array returns one entry. Clients DO see intermediate values live (progress rendering works); only the final value persists.
3. **Echo token: NOT NEEDED for the tested shapes — adjacency + persistent pending state suffice.** All replies were bare strings (typed text, choice-button labels, absence taps, a mid-stream redirect); the agent bound every one to the correct `exchangeId` because the pending question (with its id) is interpolated into the instructions from `usePersistentState`. The binding evidence is the `record_interpretation` tool part citing the exchangeId — session evidence, exactly as issue 05 hypothesized. Untested residual: simultaneous multiple open questions (ruled out by the one-ask invariant above) and long-delay/interleaved answers.
4. **Turn suspension: WORKS, with a wake wart.** `terminate: true` + pending question in `usePersistentState` + answer-as-fresh-dispatch is sufficient; nothing else needed persisting. A cancelled/redirected question reads back cleanly: the affordance part stays in the transcript, and the `record_interpretation` part (`outcome: redirected`, `epistemicStatus: stated`) is the resolution evidence — the store-level guarantee issue 05 wanted. **The wart:** writing pending-state that's interpolated into instructions triggers a "System instructions updated" advisory *after* the terminating batch, which wakes the model for an extra turn that emits redundant "I'm still waiting…" text — one wasted model call per ask, plus transcript noise. Spec options: don't interpolate the pending question into instructions (keep it in state only, or narrate it inside the ask tool's result), or accept and UI-filter. Related fact: a mixed batch (non-terminating `record_interpretation` + terminating `ask_user`) still suspended correctly.
5. **Rendering ergonomics: PROVEN.** Form-tag branching, markdown fallback, and read-back of a whole past conversation from durable history (including resolved-question dimming derived purely from `record_interpretation` parts in the transcript — no side store) all worked first try. Messages carry `purpose` and `display` fields (`display: "diagnostic"` on the advisory noise) — the UI must filter on them; the skeleton didn't at first, and the advisories rendered as visible cards.

### Incidental facts worth the spec's attention

- **`@flue/vite` hard-requires vite ^8** (its `parseAstAsync` TS support); on vite 6 the `'use agent'` scan dies with a bare parse error. The directive must also be the file's first statement.
- **The Flue dev controller gives `app.ts` the entire request space** — no fall-through to vite's HTML serving — so a co-located browser UI is served by the Hono app itself (vite still transforms module requests, but react-refresh/HMR is off the table without a second server). A real deployment would face the same: the ui shell is a separate app or app-served static assets.
- Data-channel writes are Valibot-validated per write; `body: v.any()` works fine as the opaque plugin-payload slot with typed envelope fields around it.
- Restart durability untested by design (no `db.ts` → process-memory conversations; a restart wipes them — consistent with the deploy-target-owns-persistence hypothesis).
