# Questioning-UX contract

Type: grilling
Status: resolved
Resolved: 2026-08-07
Blocked by: 03

## Question

What is the kernel's generic questioning-UX contract — the successor to brunch's `ask` / `present_*` / `request_*` exchange family — critiqued rather than copied?

Sub-questions:

- Which of brunch's exchange forms earn a place in the generic contract, which generalize with changes, which are brunch-specific and stay behind?
- What does the "one high-value question over several low-value questions" dialogue policy need from the UX contract (question budgets, visible current interpretation, distinguish not-mentioned/no/unknown/N-A)?
- How do typed issues (missing/ambiguous/conflicting/invalid/unsupported/unmapped/low-confidence) render as user-facing exchanges?
- What must the contract leave to the host surface (TUI vs. web vs. chat channel) vs. fix in the kernel?

Input from Contract decomposition (issue 04): the exchange contract must carry the envelope's conversation-level semantics — **absence states** (`unknown-to-user | declined | deferred | not-applicable`… as answer outcomes, not null), **alternatives** (letting more than one interpretation stay live through an exchange), and conflict-resolution exchanges (an explicit resolution event for a `conflicting` issue). Dialogue policy is behavioral guidance + factual issue queue — the UX contract renders issues to the agent, never scores them.

Note from the Flue deep-read (issue 01): Flue has **no first-class ask-the-user primitive** — the kernel must own a turn-suspension protocol (`terminate: true` tool + pending question in persistent state + structured data part; the answer arrives as a fresh dispatch). The UX contract should be designed with that as the remote rendering path (`useDataWriter` / `dynamic-tool` output parts), alongside richer local surfaces.

## Answer

> Resolved by HITL grilling, 2026-08-06 (five rounds), with a live fact-finding pass over Flue's docs mid-session. All shape-level commitments are **working hypotheses** per the built-artifacts-as-proofs preference (ratified into the map's Notes during this session); delegated proof obligations live in tickets 10 (walking skeleton) and 11 (logic-prototype). Vocabulary hardened via `/domain-modeling` into repo `CONTEXT.md`.

### The load-bearing reframe: no exchange-pair ontology

Brunch's exchange machinery (offer→terminal pairs, pending-exchange state, recovery scans) was baggage from its older agent-initiated turn-by-turn model and is **not inherited**. The free-flowing conversation is primary. When the agent poses a structured question it emits an **affordance** — a rendered enhancement in the stream, not a state machine the harness maintains. There is no "pending exchange" concept, hence no cardinality rule, no recovery scan, no terminal union.

- Ask invocations **do commit** structured question payloads to the session (design clue: Claude Code's `AskUserQuestion` — question set as `tool_use`, selections/interruption as adjacent `tool_result`; self-contained, replayable, no separate exchange store). The answer may follow as a structured response, or the ask may be cancelled/redirected — all of it is **session evidence**.
- **Capture is decoupled from asking**: a **range-sweep** over session entries, run on **settlement** (agent-judged, range-level — a vein closing — never per-question, which would resurrect exchange-pairs through the back door). Harness owns sweep bookkeeping (high-water mark, idempotence); agent owns settlement judgment. → ticket 11.
- Audit lessons demoted by the reframe: *declared continuations / non-forgeability* (the failure mode shifts from forgery to misinterpretation, which the envelope's `epistemic_status: inferred` already covers; whether a widget reply needs an echo token is empirical → ticket 10); *only-answered-closes recovery* and *self-contained terminals* (patterns at most, not structure).

### Shells, vocabulary, and control (hardened)

**substrate** (Pi family, Flue) → **ui** (the user-interface shell: whatever affords interaction — rendering, input, reply transport; not bound to GUI/TUI) → **harness** (the generic capability layer — mechanism + orchestration; the effort's essence is *harness-engineering*; replaces "kernel" as shell name) → **plugin** (target policy). Control is IoC per the Hollywood principle: the plugin declares and registers; the harness discovers, orders, invokes; harness capabilities (the ask API, capture envelope, issue queue, sweep bookkeeping) reach the plugin as a **narrow injected context** — the questioning-UX contract is literally part of the PluginContext surface. Composition is the plugin's at authoring time; control flow is the harness's at runtime. Schema ownership follows capability ownership: *the shell that defines a capability owns its affordance schemas.*

### What the harness fixes (the generic contract)

1. **Baseline question forms**: free-text / single-choice / multi-choice, plus **questionnaire chaining** as first-class baseline (beyond brunch's `ask`). The harness owns the standard ask API and payload shapes; plugins add custom presentation/collection forms through the plugin API.
2. **Absence**: interpret by default, afford when structured. Agent-interpreted absence from free conversation carries `epistemic_status: inferred`; structured affordances carry a one-tap absence strip (don't-know / not-applicable / decide-later — generalizing `allowNone`), keeping `unknown-to-user` vs `declined` vs `not-applicable` explicit. Transport outcome and epistemic absence never conflate.
3. **One harness data channel** multiplexing all affordance forms (`form` tag + plugin-typed body + markdown baseline), because Flue channel names are static structural identity in a flat collision-prone namespace. Plugin widgets are progressive enhancement keyed on the form tag; hosts that know only the envelope render everything via markdown. → ticket 10.
4. **Interpretation render** ("visible current interpretation"): the one affordance form that must be harness-owned, since it renders the harness's own envelope vocabulary — captures with epistemic status, absence states, live alternatives. The **plugin may supply a renderer/projector definition with typed arguments** (typed against its own payload shapes), which the harness uses to produce the ui-level view; **when it doesn't, the harness falls back to a default renderer (plain JSON view of payloads)** — keeping the renderer optional, consistent with the smallest-honest-plugin test. React vs. accept are two *capture semantics*, not exchange steps. Renderer-seam exercised once real packs exist (ticket 07's portfolio).
5. **Issues → exchanges**: only `conflicting` / `possibly-equivalent` get forced treatment — a `conflicting` issue closes **only via an explicit resolution record** (capture-layer event citing the user's utterance as evidence); the guarantee moved from wire to store. Every other issue type renders however the agent judges best, guided by kernel cards — prescribing seven mappings would be judgment-as-procedure. → ticket 11.
6. **No question-budget machinery**: economical interviewing is implemented through strategy and judgment guidance in pack kernel cards; with asks committed to session, anything countable is derivable — no stored counters, no ask-to-issue attribution model, no stored number for the agent to defer to.

### What the ui owns

Rendering (zero built-in widgets in Flue — the embedding app branches on part types), reply transport, identity. Flue facts recorded for the spec: outbound is rich (Valibot-validated `data-*` parts, dynamic-tool outputs), **inbound is string-only** (`sendMessage(text, images)`; SDK signals are string-body too) — so answer typing/validation happens entirely harness-side on read-back; unknown part types are silently dropped (hence the markdown-baseline floor); one documented contradiction (data-part update-in-place vs append) needs the ticket-10 runtime check; turn suspension confirmed (`terminate: true`, answer as fresh dispatch; multi-tool batches terminate only when every result terminates).

### Brunch disposition (sub-question 1)

**Earns a place**: the three answer shapes as interaction vocabulary; questionnaire (promoted); absence affordances (generalized from `allowNone`); react≠accept (as capture semantics); no-stored-agenda (extended: no stored counters either). **Generalizes with changes**: named present tools → plugin-declared forms over one channel; approval-commits-atomically → the resolution-record store guarantee. **Stays behind**: the exchange-pair ontology and everything predicated on it (terminal unions, recovery scans, prev/curr/next chains, declared continuations as wire mechanism), plus everything the audit already classed brunch-specific (rubric schemas, review-set node/edge machinery, graph_refs). Audit lessons not touched by the reframe (comment-vs-message provenance, boundary-teaching schemas, hash-pinned prompt directives, private scratchpad) stand as pattern guidance for the spec.

### Process decision (map-level)

**Built artifacts as proofs** ratified into the map Notes: grilling tickets resolve decisions provisionally and name the proof obligations they delegate. Two prototype tickets created from this session: [Walking skeleton: Flue question round-trip](10-walking-skeleton-flue-roundtrip.md) and [Logic-prototype: capture sweep & settlement](11-logic-prototype-capture-sweep.md). Plugin lifecycle, fault containment, and contract versioning routed to [Shipping shape](06-shipping-shape.md).
