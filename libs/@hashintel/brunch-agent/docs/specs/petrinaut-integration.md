# Integration spec: the elicitor behind Petrinaut's chat panel

**Ticket**: FE-1433 (the integration-spec issue) · **Decision record**: ADR-0004
(`docs/adr/0004-in-petrinaut-staging-and-the-monorepo-import.md`) · **Supersedes**:
`recommendation-demo-vehicle.md` as the September staging plan · **Evidence base**: the
Petrinaut survey (FE-1358, `research/petrinaut-survey.md`), re-verified against
`hashintel/hash` source on 2026-08-18 · **Amended**: FE-1506 (stable UI and voice attach
contract), H-6763 / ADR-0009 (generic composer submission and app-owned voice boundary).

## Problem Statement

The September demo must show agentic elicitation producing a working process model — durable
capture with provenance, completion accounting, a live interpretation render, and a net that
runs — and the 2026-08-18 meeting decided it must do so **inside demo.petrinaut.org's existing
chat panel**, not in a separate application. Petrinaut's incumbent assistant is a stateless
browser-resident chat over a Vercel edge proxy: it persists only a transcript and a net in
localStorage, and has no server, no sessions, no capture store. The elicitor is the opposite
shape: a stateful server-side agent (Pi/Flue substrate) with its own loop, tools, and durable
storage. The problem is connecting the second to the first without rebuilding either.

## Solution

The brunch elicitor runs as a **remote server** built on the harness + `binding-flue`. The
demo site swaps its `aiAssistant.transport` to point at that server; everything else in the
panel — rendering, the diagnostics decorator, client-side tool execution — is reused as-is.
The elicitor drives Petrinaut's editor through the **existing UI-executed tool surface**
(schemas imported from `petrinaut-core`), riding the harness's turn-suspension protocol: a
turn ends with tool calls pending, the panel executes them, and the outputs return on the next
dispatch. Sessions, captures, and IRs persist server-side, keyed to an opaque principal the
site supplies from a localStorage UID. The wire contract is the AI SDK v6 UI-message-stream
protocol, produced by a new `transport-aisdk` package that translates harness-level parts to
stream chunks and knows nothing about Flue.

## Seams

One primary seam, four supporting ones — all existing except the brunch server's front door,
which the design needs anyway:

1. **The ChatTransport wire seam** (primary; the contract-test surface): the AI SDK
   UI-message-stream protocol over HTTP/SSE. Everything brunch-side sits behind it; everything
   Petrinaut-side sits in front of it. The panel's real behavior is verified once in the
   adapter spike and frozen as golden fixtures.
2. **The ask/affordance protocol seam** (`core`'s ask-protocol module, per ADR-0002 N1): the
   external-tool round-trip protocol is tested here, substrate-free.
3. **The storage port seam** (ADR-0002 N5): the owner key is tested as store-level refusals.
4. **The artifact seam** (`parseSDCPNFile` / `sdcpnFileSchema`): unchanged; net validity
   checked in CI through the pure parser.
5. **The generic composer and Voice mode seam**: a host may render a control beside Petrinaut's text
   composer or one provider-neutral Voice mode inline with its transcript. Both receive stable
   submission controls, the effective AI SDK conversation identity and current state. Finalized
   alternate text uses the same AI SDK `useChat` instance as keyboard input. When exactly one
   unresolved interactive tool registers a schema-validated text mapper, submission completes that
   tool; otherwise it creates a stable-ID user message. Ambiguous mapped tools are refused. A host
   may explicitly target an ordinary message for a correction that must not answer the pending tool.

## Attach Contract

The panel and the voice edge attach to Brunch through one stable surface:

1. **Chat stream**: the UI sends `POST /api/chat`; a successful response is an AI SDK v6
   UI-message stream over HTTP/SSE.
2. **Question affordance**: the UI-executed tool is named `brunch_ask`. Its input schema is
   `{ question: non-empty string }`; its submitted output schema is
   `{ answer: non-empty string }`.
3. **Principal identity**: every request carries one non-empty, opaque principal in the
   `x-brunch-principal` header. The current UI shell keeps that value in localStorage so it is
   stable across reloads; replacing the local UID with authenticated identity must preserve the
   same request-level ownership semantics.
4. **Composer submission**: Petrinaut accepts an optional stable conversation ID and host composer
   control, then exposes the effective host-supplied or generated identity to that control. Keyboard
   and alternate finalized text both enter the same `submitText` function. A pending `brunch_ask`
   is answered only through the existing correlated tool-output path; text is not silently
   downgraded to an ordinary user message when more than one mapped ask is pending. Explicit
   corrections target new messages rather than silently mutating or answering another pending ask.
5. **Voice mode publication**: Petrinaut accepts an optional `renderVoiceMode` callback and publishes
   provider-neutral input mode, panel visibility, messages, readiness, stable lifecycle controls,
   and `submitVoiceInput`. Finalized Voice input enters the same correlated submission path and
   carries persisted Voice provenance on either the ordinary user message or the exact
   `brunch_ask` tool output, never both.

These five parts change only with notice to the panel and voice-edge owners. A provider-specific
voice requirement does not silently alter this surface; provider code and policy remain in the
host application under ADR-0009, while reusable Petrinaut and Brunch packages stay provider-free.

## User Stories

1. As a demo.petrinaut.org visitor, I want to converse with the elicitor in the same chat
   panel I already know, so that elicitation feels native to the tool rather than bolted on.
2. As a demo.petrinaut.org visitor, I want the elicitor to interview me about my process
   before building, so that the net reflects my domain rather than a one-shot guess.
3. As a demo.petrinaut.org visitor, I want to watch the net appear and change on the canvas as
   I answer, so that I can correct misunderstandings the moment they become visible.
4. As a demo.petrinaut.org visitor, I want my session to survive a page reload, so that a long
   elicitation isn't lost to an accidental refresh.
5. As a demo.petrinaut.org visitor, I want my sessions kept private to my browser, so that
   another visitor cannot see or alter my work.
6. As a demo.petrinaut.org visitor, I want the elicited net to carry a scenario and run, so
   that the interview demonstrably produced a working model, not a picture.
7. As the demo presenter, I want the elicitor's captures and completion accounting rendered
   live, so that the audience sees what a prompt-in-a-panel cannot do.
8. As the demo presenter, I want to export the elicited net as a file and open it in stock
   Petrinaut, so that the decoupling claim is made visible on stage.
9. As the demo presenter, I want the elicitor to keep working when a model turn emits dozens
   of mutations, so that a realistic-sized net doesn't stall the demo.
10. As the elicitor (agent), I want Petrinaut's mutation, read, and diagnostics tools exposed
    to me with their real schemas, so that I can build and repair nets the way the incumbent
    assistant does.
11. As the elicitor (agent), I want tool outputs from the browser to re-enter my loop as
    machine entries, never as user evidence, so that capture spans only ever cite the user.
12. As the elicitor (agent), I want to see TypeScript diagnostics after code-writing
    mutations, so that I can validate every change without the user relaying errors.
13. As the harness, I want the external-tool round-trip to ride the same suspension floor as
    the ask protocol, so that one substrate capability serves both and the second-binding test
    stays small.
14. As the harness, I want retries and duplicate dispatches on the round-trip to be idempotent
    (per the affordance-protocol guarantees), so that a flaky network cannot double-apply.
15. As a brunch developer, I want the stream adapter to consume harness-level parts only, so
    that swapping `binding-flue` for another binding never touches the wire layer.
16. As a brunch developer, I want contract tests that drive the server exactly as the panel's
    wrapped transport does, so that panel compatibility is provable without a browser.
17. As a Petrinaut maintainer, I want brunch's needs expressed as generic host extensions to
    the `aiAssistant` prop, so that my library stays elicitor-agnostic.
18. As a HASH product owner, I want the principal abstracted so Ory identity can replace the
    localStorage UID, so that the same server later serves the HASH app unchanged.
19. As an infra engineer, I want the elicitor server to be an ordinary deployable in
    `hashintel/hash` with Postgres-backed storage, so that it fits the infrastructure we
    already run.
20. As the operator of a public endpoint, I want per-principal rate limiting and an origin
    allowlist, so that an unauthenticated UID cannot be farmed for free inference.
21. As a future petrinaut-website maintainer, I want brunch-specific wiring contained at the
    app level (as the existing Actual-mode brunch-demo route already is), so that removing or
    evolving it never archaeology-digs through the library.
22. As a Petrinaut host, I want finalized alternate input to share keyboard submission and pending
    interactive-tool correlation, so that a host control cannot create a second conversation path.
23. As a demo.petrinaut.org visitor, I want Voice mode to stay inside the same transcript and
    composer as text, so that provisional speech, finalized answers, and recovery remain legible
    without creating a second conversation.

## Implementation Decisions

**Topology and packaging**

- The elicitor server is a thin host-authored agent (spec §13) around the harness library,
  deployed remotely; the demo site's same-origin `/api/chat` route reaches that server without
  routing through the stock Petrinaut assistant or its prompt.
- Implemented by FE-1436 (the durable AI SDK transport): package `transport-aisdk` is the
  server end of the ui shell's reply transport. It translates
  harness-level parts to AI SDK v6 UI-message-stream chunks, using the `ai` package for stream
  encoding only (no provider use — inference stays on Pi's adapter layer). Depends on `core`,
  `ai`, and `valibot` for external request validation; never on the binding or Flue. This adds
  a `transport-*` role prefix to the §12.2
  vocabulary (the glossary's avoided terms `adapter-*`/`wrapper-*` stay avoided). The
  implementation and real-panel evidence are recorded in
  `transport-aisdk-implementation-2026-08-19.md`.
- Kernel spec amendments applied with this work, not silently: §12.2 package list gains
  `transport-aisdk` and records the monorepo import (`@hashintel/brunch-agent`, hash
  toolchain replacing the Bun workspace at import time); §13's shipping shape and ADR-0002 N3
  reflect the retired demo shell.

**The suspension floor and the external-tool protocol**

- One substrate capability — end a turn with pending items, resume on a later dispatch with
  per-session state intact — carries two core protocols: the existing ask protocol and a new
  **external-tool round-trip** protocol.
- The protocols differ deliberately: asks are singular (§7.3) and harness-slot-bound; tool
  round-trips are **batched** (the panel executes a turn's tool calls and returns all outputs
  in one POST) and wire-bound by tool-call id. Whether batching is a variant of the pending
  slot or a parallel channel is **spike-gated** (see Testing Decisions), not decided here.
- Entry provenance discrimination extends to resumed tool outputs: they enter as machine
  entries, excluded from evidence-span anchoring (§9.4). This is a hard invariant, enforced at
  the same level as the existing span-anchoring rules.
- Fallback if Flue cannot carry the suspension shape: the app-level doc-handle side channel —
  the server streams net definitions to the site, which writes them into the
  `PetrinautDocHandle` outside the chat loop (the Actual-mode brunch route is the precedent).
  Degraded (no read-tools, no diagnostics loop), which is why it is the fallback.

**Client tool exposure**

- The elicitor's Petrinaut tools are generated from `petrinaut-core`'s exported tool schemas,
  so the tool surface tracks Petrinaut's own contract rather than a hand-copied one.
- The panel executes only tool names it knows and throws on unknowns; brunch-only tools
  therefore execute server-side. If a UI-executed brunch tool is ever needed, the change
  is a generic host-supplied-handlers extension to the `aiAssistant` prop (post-import,
  per ADR-0004's boundary discipline).

**Generic composer and Voice mode controls**

- `@hashintel/petrinaut` accepts an optional conversation ID, `renderComposerControl`, and
  `renderVoiceMode`. The callbacks receive the effective host-supplied or generated AI SDK
  conversation identity, current messages and status, plus stable submission and lifecycle
  functions. The Voice mode callback additionally receives panel visibility, input mode, active
  state, one-answer readiness, and a registration seam for pause and end controls.
- A host interactive tool may define `fromComposerText({ input, text })`. Petrinaut parses the
  pending input, invokes the mapper, and parses its output before submitting the correlated tool
  result. Unknown or unmapped tools preserve ordinary message submission; multiple eligible tools
  fail visibly rather than guessing. The host may explicitly target a separate message for a
  correction or follow-up that must not resolve a pending tool.
- Text and Voice mode share one transcript and composer. An empty composer shows the waveform when
  Voice mode is available, typed text shows **Send**, and an active stream shows **Stop**. The
  host-rendered Voice mode stays mounted inline as a compact divider. Provisional transcription
  appears immediately before it and is replaced by one finalized ordinary message or correlated
  tool output with persisted waveform provenance. Provisional transcription and Realtime audio are
  not persisted as chat history.
- Typed text ends active Voice mode before exactly one shared-path submission and keeps its draft
  if the handoff fails. Closing the panel pauses Voice mode before hiding it; reopening retains the
  mounted session paused. Consent, pause and end overflow controls, actionable recovery, collapsed
  technical details, live announcements and motion preferences belong to the app-owned
  presentation.
- The seam is provider- and elicitor-agnostic. OpenAI WebRTC, transcription policy, speech, and
  duplex media state belong to `apps/petrinaut-website`; Brunch remains behind the existing
  transport and remains authoritative for questions, captures, completion and durable history. See
  [ADR-0009](../adr/0009-openai-voice-ui-turn-shell.md).

**Identity and storage**

- The principal is ui-shell-owned: the demo site mints a random UID into localStorage and
  sends it on every transport request. The host-authored server layer authenticates/resolves
  principal → session set; the harness stays principal-free.
- The storage port gains an opaque owner key, stamped at session creation; cross-principal
  access fails as a store-level refusal (the port's existing enforcement idiom). The binding
  treats the key as opaque.
- Rate limiting is per-principal (and per-IP) at the server's front door, with a CORS origin
  allowlist. The UID is identification, not authentication; the demo threat model accepts
  this, and the Ory swap closes it for HASH.

**Sequencing**

- Harness-internal work continues in this repo and travels with the git-history import. The
  two spikes run **before** the import (petrinaut-website driven locally from a hash checkout;
  zero commits to `hashintel/hash`). Only petrinaut-website wiring, Petrinaut-library
  extensions, and deployment integration wait for the move.

## Testing Decisions

- Tests assert external behavior at the four seams; nothing asserts panel internals or Flue
  internals.
- **Wire seam**: contract tests drive the server with recorded panel round-trips (POST message
  history including batched tool outputs; assert the SSE chunk stream). The recordings are
  produced once by the adapter spike against the real panel and frozen as golden fixtures —
  the same freeze/replay posture as §14.4's fixture format.
- **Ask-protocol seam**: the external-tool round-trip protocol gets the same substrate-free
  treatment the ask protocol already has (FE-1422's extraction is prior art), including the
  retry/idempotence properties FE-1420 establishes.
- **Storage port seam**: owner-key refusals tested as store-level refusals with red-proofs,
  per the FE-1419 discipline (`test/boundaries.test.ts` is prior art for the gate style).
- **Artifact seam**: elicitor-emitted nets validated in CI through `parseSDCPNFile` plus the
  survey's three above-schema checks (PascalCase place names, arc endpoint exclusivity,
  scenario presence).
- **Spikes are the evidence instrument for the two open questions**, each with a written
  verdict:
  1. _Suspension spike_: Flue carries terminate-with-pending; a resume dispatch delivers
     machine results as non-user entries; batch binding holds. Failure here selects the
     doc-handle fallback and is evidence toward a `binding-pi`, not against the harness.
  2. _Adapter spike_ (discharged by FE-1435 and carried into the FE-1436 durable path):
     `transport-aisdk` output drives the real panel — text, reasoning, and
     server-tool parts render; client tool calls execute; the diagnostics decorator fires.
     Its transcript becomes the golden fixtures.
- **Unified Voice mode surface**: Petrinaut panel tests pin action priority, one transcript,
  persistent mounting, typed handoff, pending-question correlation and provenance. Website tests
  pin inline ordering, provisional replacement, consent, pause-before-close, recovery, overflow
  focus, live-announcement throttling and generated reduced-motion styles without requiring live
  media. The package build validates Panda extraction.

## Out of Scope

- Provider-specific voice behavior in Petrinaut or Brunch. The app-owned, disabled H-6763 preview
  is governed by ADR-0009; production recovery and rollout wait for its named prerequisites.
- HASH-app integration (design-for via the principal and adapter abstractions; no build).
- The interpretation-render panel's visual design and placement (app-level UI vs.
  `PetrinautSlots` — decided when the demo-site wiring starts, after the spikes).
- Any change to `@hashintel/petrinaut` beyond the generic host-extension named above.
- Deployment specifics (host, Postgres wiring, CI) — owned with infra on their own ticket.
- Elicitation quality (packs, strategy quiver, sweep behavior) — the harness build's remit,
  unchanged by this spec.

## Further Notes

- The differentiation narrative survives the staging change: the demo's claims (durable
  capture, completion accounting, provenance) remain exactly what the incumbent
  prompt-in-a-panel cannot do — now shown _in_ the panel rather than beside it.
- The incumbent assistant's tool-call-per-element scaling concern (survey §6d: a 40-place net
  is ~100 sequential mutations) now applies to brunch too; the suspension spike should note
  observed round-trip counts, and batching mutations per turn is the first lever if it bites.
- The survey's iframe/localStorage caveats applied to HASH's embed, not the demo site — the
  demo site is a same-origin SPA and unrestricted. The Ory-principal swap is where the embed's
  constraints re-enter, later.
