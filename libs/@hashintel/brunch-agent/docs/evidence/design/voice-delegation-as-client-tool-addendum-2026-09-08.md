# Addendum — bounded Voice delegation as a Brunch client tool

Date: 2026-09-08. Author: Lu Nelson (drafted with Amp). Responds to Kostandin's design proposal "Split-ownership voice conversation" (foundation PR #9564, revision `132831f`).

> Design analysis only. Not execution authority and not a mission draft. Nothing here may be implemented before it is converted into a live `MISSION.md` on its own issue, branch, and PR. The live mission remains Mission 7. Any Linear write needs explicit owner approval.

## 1. What this addendum is for

Kostandin's proposal compares three ownership models — improved relay, Realtime-led, and split ownership — and asks for approval of one small validation experiment. This addendum does not argue with that framing. It does two things: it corrects the picture of what the runtime can and cannot do, based on inspection of the installed `@flue/sdk` and the current Brunch client-tool mechanism, and it proposes a concrete way to build the split-ownership experiment out of machinery that Mission 6b already proved, so the two approaches can be compared on cost as well as on experience. Where the proposal's "Required runtime support" list assumes capabilities that do not exist, this document says so and shows what exists instead.

The intent is to make the cost of Approach 3 legible before anyone commits to it, not to sell it.

## 2. Two facts about the substrate that change the plan

### 2.1 Flue has no way to write to a conversation without waking the agent

The proposal's first required capability is "a persistence-only API for recording local exchanges without invoking Brunch". The installed `@flue/sdk` has no such door. Its client surface is `send`, `read`, `wait`, `abort`, `history`, `observe`, and `attachmentUrl`. The only way anything enters canonical conversation history is a *delivery* — a message of `kind: 'user'` or `kind: 'signal'` — and the runtime's own documentation is explicit that every response starts from a delivered message and that the agent function renders before every model call. In plain terms: if you write to the conversation, Brunch wakes up and the model runs. There is no "just record this".

There is one write that does not wake the model — `useDataWriter`, which streams named data parts to connected clients — but it only works *from inside* a running response, it is one-way out of the agent, and the model never sees those parts. It cannot carry exchanges that Brunch later needs to read.

So "persistence-only recording" would be either a feature request to the Flue team or a sidecar store outside Flue. Mission 6b's owner disposition already refused sidecars, text-encoded workarounds, and Flue patches for the closely related attribution problem, and the planning record says the same about task-local JSON across any process boundary. Treat item 1 as unavailable.

Two things Flue *does* offer are useful here. A `signal` delivery carries `attributes` — a string map for sender identity and structured metadata — and renders to the model as a tagged block rather than a chat turn. That is a durable, framework-native attribution channel, which is exactly what 6b found missing for plain spoken user turns. And the model-facing input of a delivery is snapshotted at admission, so whatever a signal carries is the durable record.

### 2.2 Brunch's "client tools" settle and continue; they do not suspend

It is tempting to think of the existing browser tools (`getLatestNetDefinition`, `addArc`, `readPetrinautDoc`) as tool calls that pause the Flue turn while the browser works. They do not. The mechanism, visible in `packages/plugin-sdcpn/src/tools/petrinaut-construction.ts` and `apps/brunch-agent/src/conversation/client-tools.ts`, is:

1. The Flue tool returns `{ awaiting: "client" }` with `terminate: true`. The model's step ends and the **submission settles** on the Flue side.
2. The browser sees the pending call in the stream, executes it locally, and sends the result back as a *new delivery*: a `client-tool-result` signal whose body is a JSON array of `{ toolCallId, toolName, output }`.
3. That signal wakes Brunch, which reads the result (the agent instruction says "treat output as the browser's result for that call") and continues.

This is the "causal per-step client result" path that 6b repaired and accepted. It also explains 6b's deferred limitation: once step 1 has settled, browser work that is withheld locally has no canonical record, so on reopen the call can reappear as pending. Anything built on this path inherits both the strengths (correlation, ordering, reopen hydration) and that gap.

## 3. The proposal, restated without pattern names

Strip the words "split ownership" and "delegation scope" and the obligation is this. Sometimes Brunch knows exactly what it needs to find out next and can say so in a sentence, and the slow part of the current experience is that every small back-and-forth to get there costs a full Brunch turn. We want something faster and more conversational to conduct that short exchange, under limits Brunch sets, and then give Brunch back a record of what was said and what was learned — in order, attributed, surviving reopen, and stoppable.

That obligation has the shape of an interactive client tool, and Brunch already has a suspended contract for one: `ASK_TOOL_NAME` in `packages/core/src/client-tools.ts`, with a browser rendering in `apps/petrinaut-website/src/main/app/local-storage-demo/brunch-ask-interactive-tool.tsx` that the 2026-09-04 decision retired from code. It is also, in mechanism, ADR-0009's original `continue_interview` function, which the current policy (`brunch-control-plane-v3`) removed in favour of a pure relay. The planning record gates re-entry of a structured-question route on "plain-turn strain and owner acceptance". The strain is now observed in two witnesses; acceptance is the owner's.

Here is what would happen, step by step.

```diagram
 Brunch (Flue)                       Browser                          Realtime (OpenAI)
┌───────────────────────┐    ┌────────────────────────────┐    ┌──────────────────────────┐
│ 1. model calls        │    │                            │    │                          │
│ clarify_by_voice      │───▶│ 2. sees pending call       │    │                          │
│ {objective, limits}   │    │    switches session policy │───▶│ 3. instructions = guard  │
│ tool returns awaiting │    │    (relay → delegation)    │    │    + objective + limits  │
│ submission settles    │    │                            │    │    tools = [hand_back]   │
│                       │    │                            │    │    create_response: true │
│                       │    │                            │    │                          │
│                       │    │ 4. records each exchange:  │◀──▶│ 5. user ⇄ realtime,      │
│                       │    │    user transcript,        │    │    n short turns         │
│                       │    │    realtime output text    │    │                          │
│                       │    │                            │    │ 6. calls hand_back       │
│                       │    │ 7. validates args, builds  │◀───│    {summary, status}     │
│                       │    │    result, restores relay  │    │                          │
│ 9. woken by signal,   │◀───│ 8. sends client-tool-result│    │                          │
│ reads exchanges +     │    │    signal                  │    │                          │
│ handback, continues   │    │                            │    │                          │
└───────────────────────┘    └────────────────────────────┘    └──────────────────────────┘
```

From the user's side: Brunch's question is spoken as now; then the voice asks one or two short follow-ups in its own words and reacts to the answers immediately; then there is a pause while Brunch thinks, and Brunch's next canonical turn is spoken. The user hears one voice throughout and does not see a concept called "delegation".

## 4. The tool contract

Names are placeholders; the shapes are the point.

**Name.** `clarify_by_voice`, a core-owned client tool (it is elicitation capability, not SDCPN-specific, so it belongs beside the suspended `ask` contract in core, not in a plugin or the website).

**Input (Brunch → browser).**

- `objective` — one or two sentences stating what must be learned, in the interviewer's voice. Example: "Find out what happens when approval is rejected: who is told, and whether the item goes back to the start or to the previous step."
- `limits` — a short list of prohibitions Brunch attaches for this case. Example: "Do not ask about who approves. Do not suggest possible outcomes; if the person does not know, accept that."
- `maxExchanges` — an integer cap, small (2–3), enforced by the browser, not by the model.

**Output (browser → Brunch, inside the `client-tool-result` signal).**

- `status` — `completed` (Realtime handed back), `capped` (exchange limit hit), `cancelled` (user exited Voice or pressed Stop), or `failed` (provider or transport error).
- `exchanges[]` — in order, each `{ speaker: "user" | "voice", text, at }`. User text is the finalized input transcription the session already receives (`conversation.item.input_audio_transcription.completed`); voice text is the Realtime model's own output transcript for that response.
- `handback` — the Realtime model's short summary from its `hand_back` call, present when `status` is `completed`. Brunch must treat it as a *hint*; the exchanges are the evidence.

**Guard prompt.** The instructions the Realtime model runs under during a delegation — register, "you are collecting, not deciding", never suggest answers, never restate the person's words as fact, accept "I don't know", call `hand_back` as soon as the objective is met or the person stalls — are elicitation policy. They must be owned and versioned by Brunch core and imported by the website, the same way core already owns the SYSTEM prompt and the `elicitation` skill. ADR-0009's "Brunch packages contain no OpenAI code" is not violated by a prompt string; what it forbids is OpenAI client code in Brunch packages. If the website owns this text, the project has two elicitation policies with two owners, which is the failure the core/plugin/app split exists to prevent.

**Mount rule and text-mode behaviour.** The Flue agent renders per response and could mount the tool only when Voice is active, but the agent has no reliable way to know that: `kind: 'user'` deliveries carry no attributes, and tracking a mode flag in persistent state means every Voice start/stop becomes a delivery that wakes Brunch. The least mechanism is to mount the tool always and let the *browser* decide how to execute it: in Voice mode it runs the Realtime delegation; in text mode it renders the same objective as a short typed form — the retired `brunch-ask-interactive-tool.tsx` is a working starting point. This preserves the proposal's consistency goal (same objective, same record shape, different modality) at the cost of a real product change to text mode: Brunch may sometimes surface a small form instead of asking inline. That is a decision for the owner, not an implementation detail, and it can be avoided by instructing Brunch to call the tool only after being told the user is speaking, at the price of relying on prompt compliance rather than mounting.

## 5. What this inherits from Mission 6b, and what it does not

| Concern | Inherited? | Why |
| --- | --- | --- |
| Result correlation to the exact pending call | Yes | Same `toolCallId` path, same `completedClientToolResults` collector repaired in 6b |
| Causal ordering across steps | Yes | Same per-step result signal |
| Reopen hydration of the call and its result | Yes | Same history projection |
| Attribution of who said what *inside* the delegation | Yes, and it is new | Each exchange carries `speaker`; it lives in the result payload, which Flue persists. 6b could not do this for plain spoken turns and this does not fix that either |
| Durable Stop while Brunch is running | Yes | Unchanged: `abort()` on an active submission |
| Durable Stop *during* the delegation window | Partly | Flue has already settled; there is nothing to abort. The browser must instead send a `cancelled` result *immediately*, with the exchanges so far, which closes the pending call durably. If the browser dies before it can, the call reappears as pending on reopen — 6b's deferred limitation, now more exposed because the window is tens of seconds of conversation rather than a synchronous browser mutation |
| Exit Voice mode vs Stop work | No, unchanged strain | Still two different actions; the proposal's item 5 stands on its own |
| Comparative latency | No | Still unmeasured; see §9 |

The honest summary: the tool form gets ordering, correlation, reopen, and attribution of the delegated exchanges essentially for free, turns "Stop during delegation" from impossible into "works while the browser is alive", and leaves the crash case where 6b left it.

## 6. What must change on the Realtime side

This is where the real engineering is. The current session is deliberately inert: `tool_choice: "none"`, `tools: []`, `create_response: false`, `interrupt_response: false`, and instructions that forbid speaking between turns. The delegation requires a second session posture and a clean switch between them.

- **Two policies, one session.** A `session.update` at delegation start that sets the guard + objective + limits as instructions, enables `create_response`, and registers the single `hand_back` function; a `session.update` at delegation end that restores the relay policy. The policy module (`openai-voice-policy.ts`) and its tests currently pin exactly one posture; they would pin two and the transition.
- **New event surfaces.** The session (`openai-realtime-session.ts`, 1.5k lines with a 1.7k-line test file) currently parses input transcription, buffer, and response lifecycle events. It would also need to parse the model's output transcript events (to record what the voice said) and function-call argument streaming (to receive `hand_back`), with the same strict-GA-parsing and fail-closed discipline as today. ADR-0009's original design did this for `continue_interview` and was later removed; some of that code may be recoverable from history, but it was written against a different Brunch topology.
- **Turn controller mode.** The turn controller (`voice-turn-controller.ts`, ~1k lines, 2k lines of tests) is a state machine over connection/input/output with an explicit relay assumption: the only thing that may be spoken is canonical text. It needs a `delegating` state in which Realtime speaks its own words, barge-in interrupts Realtime rather than canonical playback, and the exchange cap, timeout, Exit, and Stop each produce a well-defined result. Every existing regression about ownership, cancellation, and stale-epoch rejection has to be re-proved with the new state present.
- **Bridge.** The bridge (`realtime-brunch-bridge.ts`) matches canonical replies and client-tool admissions to submissions. It would build the `clarify_by_voice` result and submit it through the same client-tool-result path the browser mutations use.
- **Panel rendering.** The transcript must render the delegated exchanges as speech (with speaker chips) rather than as an opaque tool result, and the persisted result must hydrate the same way on reopen.

## 7. Costs, stated plainly

**Engineering.** The Voice subtree in `apps/petrinaut-website/src/main/app/voice-interview/` is roughly 12,000 lines including tests, about half of it tests, most of them pinning exactly the invariants a second session posture disturbs. Adding a mode to the session and the turn controller and re-proving their regressions is days of focused work by someone who already knows that code, not hours; the core contract, guard prompt, and the panel rendering are smaller but touch three packages and the app. The retired `ask` tool gives the text-mode fallback a head start. Nothing here is speculative infrastructure — every piece is a change to a file that exists — but it is not a small experiment in code terms. Approach 1's improvements (spoken-register hint, first-sentence-early speech, shorter tool chains) are a fraction of this and touch mostly prompts and the bridge.

**Runtime money.** Today every user utterance costs one transcription and one Claude turn, and every reply costs one Realtime audio response reading canonical text. A delegation replaces two or three Claude turns with two or three Realtime *conversational* responses, which are billed on audio input and output tokens at rates well above text, plus the transcription that already runs. Whether that is cheaper or more expensive per clarified fact depends on how long the exchanges run and how many Claude tool steps they save; nobody should assume a saving. It is measurable in the experiment and should be measured.

**Model quality and evidence transfer.** Mission 4's evidence that the elicitation skill activates and behaves correctly was gathered against Claude through Flue. During a delegation the interviewer is `gpt-realtime-2` at low reasoning effort holding a guard prompt and a sentence of objective. It has none of the `elicitation` skill's judgement about correction versus contextual coexistence, unknown versus not-yet-asked, or when to stop. The proposal already names leading questions and competing strategies as risks; the tool form bounds the window but does not change the model doing the asking. None of the Mission 4 evidence transfers to that window.

**Maintenance.** The project would carry elicitation guidance for two runtimes with different behaviour, and every change to how Brunch asks must be checked against how the voice asks. The core-ownership rule in §4 keeps that to one owner, but it does not make it one artifact.

**Product change in text mode.** If the tool is always mounted, typed conversations sometimes get a form. If it is mounted only under a prompt instruction, correctness relies on the model not calling it in text mode. Either is a visible decision.

**Provenance addressing.** The user's words during a delegation are recorded inside a tool result, not as `user_message` records. The workpiece revision protocol locates evidence by message id and passage. Those locators would need a way to point into a result payload, or the record must be projected into something they can address. This is a real cost to the provenance work Mission 7 is doing now and must not be hidden.

## 8. Risks and fog

- **Will the Realtime model stay inside the scope?** Unknown until tried. The guard prompt, the exchange cap, and a reviewer reading exchanges against the scope are the controls; the cap is the only one that is mechanical.
- **Do the recorded words match what the model heard?** The model hears audio; the record is `gpt-4o-transcribe`'s text. Where they diverge, Brunch reasons from the transcript and the voice reasoned from the audio. This is already true for plain turns; delegation adds the voice's *replies* being based on something the record may not show.
- **Will Brunch treat exchanges inside a tool result as evidence of the right weight?** Models tend to read tool output as data rather than as the person speaking. The agent instruction can say otherwise; whether it is enough is an oracle question for the experiment.
- **Barge-in semantics.** Interrupting the voice mid-follow-up now cancels a Realtime-authored response, not canonical playback. The user's interrupting words are a new exchange. This needs a stated rule and a test.
- **What Stop means to the person.** Two controls already confuse; a third state makes the distinction matter more.
- **Passage locators** into result payloads, as above.

## 9. The experiment, adjusted

Kostandin's protocol — one objective, two recorded exchanges, one handback, one Brunch-validated update, close and reopen, reconstruct the history — is right. Three adjustments:

1. **The baseline must be the optimized relay**, not the current one. Otherwise the comparison measures the relay's known register and latency defects, which have separate, cheap fixes, and attributes the improvement to ownership. The proposal concedes this; the sequencing must enforce it.
2. **Name the oracles.** Latency comes from the content-free lifecycle ledger that already exists. Naturalness, repetition, and boundary violations need a human witness with a fixed rubric reading both transcripts blind to condition. "Information gained" needs a pre-written list of facts the scenario contains, held on the evaluation side like every other answer key. Money comes from provider usage for the run.
3. **Scope the verdict.** A win establishes that bounded voice delegation is worth its cost for clarifications of this shape. A loss establishes that it is not. Neither says anything about Approach 2, and neither may rewrite the elicitation prompts to satisfy the rubric.

Expected order: spoken-register hint and early first-sentence speech on the relay; measure real turns with the ledger; only then build the delegation experiment against that baseline.

## 10. Where this leaves the comparison

Approach 1 is cheap, safe, and unmeasured; do it first regardless. Approach 3, built as a client tool, is buildable with the runtime we have, reuses most of what 6b proved, and improves attribution and Stop for the delegated window rather than weakening them. Its costs are real engineering in the Voice state machines, unknown per-fact running cost, an interviewer model with no proven elicitation judgement inside the window, a permanent two-runtime maintenance burden, a visible text-mode decision, and a provenance-addressing problem for the work Mission 7 is doing now. It should proceed only if the optimized relay still feels stilted and the experiment shows the delegation earns those costs.

Approach 2 is not made cheaper by anything here. A Realtime-led interviewer would still have to route every state change through Flue, so it rebuilds this bridge inverted and discards Mission 4's evidence entirely.
