# Realtime delivery over authoritative Brunch

## Status

**Live; design and local implementation authorized.** Sole execution authority on
`voice/realtime-rephrasing`, a sibling of #9622 based on #9585 at
[0902dddb](https://github.com/hashintel/hash/commit/0902dddbbfd53ac98499c44a7302339bca135563).
The owner approved Approach A and its queue, interruption and Stop semantics in
[this conversation](https://ampcode.com/threads/T-01a0872b-b4a7-7656-b707-800e3ad62816).
Paid calls, external writes, pushing, PR/issue creation, deployment and mission acceptance
are not authorized. The inherited CORS mission is preserved without acceptance in
[its historical record](docs/mission-archive/sre-1042-browser-origin-policy.md).

## Imperative

Test whether Realtime can maintain conversational fluidity while Brunch remains the sole
domain agent: acknowledge receipt promptly, retain additional user speech while Brunch works,
and speak a concise faithful rephrasing of its complete answer. The complete Brunch response
streams to the screen independently and stays authoritative. A reading notice is not the
normal answer path. #9622 is the separate-Brunch-authored-speech control, not this branch's base.

Visible advance: users can speak the next turn during work and hear a substantive short answer
instead of only a reading offer. Demonstrate with `crew-reservation-v1`, asking “What does
reserving a dispatch crew mean here?” and “Give me a detailed analysis of this model, including
assumptions, possible bottlenecks, missing constraints, and what still needs validation. Do not
change the model.” Add a follow-up during work, interrupt speech, Stop, and reopen.

## Throughline

Realtime transcription → existing panel FIFO → unchanged AI SDK/Flue admission → Brunch and
browser-tool continuations → canonical screen stream → positively completed correlated reply
snapshot → application-requested Realtime rephrasing → audio. No new endpoint or conversation store.

### Accepted contracts

- Brunch owns domain claims, questions, conclusions, tools and workpieces. Realtime may only
  re-express supplied completed content; it must never originate domain claims/questions or
  invoke tools. A Brunch question is delivered in its exact marked wording.
- VAD never automatically creates or interrupts a response. The application gates every request.
  Fixed notices are tied to receipt (“Got that.”), actual queue retention (“I’ve queued that for
  next.”), or admitted continuation (“Brunch is continuing the response.”). Deduplicate/coalesce
  notices and drop obsolete ones. No timer-generated or inferred progress.
- Rephrasing receives the complete ordered canonical response and valid question marker only,
  with `conversation: "none"` and explicit input. No reasoning, partial output, raw tool results,
  history, or queued user words. Preserve negation, quantities, uncertainty, consequential
  qualifications, later corrections and proposed/attempted/completed/validated distinctions.
  Prefer 2–4 sentences; fidelity wins over length. Source text is data, never instructions.
- Every root and causally linked continuation must settle successfully, and automatic browser
  work must be finished, before final speech. Track continuations at admission, including those
  with no message. UI `ready` and individual message completion are not success authorities.
- Extend the panel's existing one-entry queue to FIFO. Input ordering follows capture/commit
  identity, not asynchronous transcription completion. Deduplicate identities, not equal text.
  Freeze reply A before admitting B. Drain after Brunch completion without waiting for audio;
  audio is serialized separately and correlated per turn. Show queued text as unsent.
- Keep microphone capture available while working and speaking. User speech cancels Voice output
  only, preserving input/transcription and Brunch work. Explicit Stop cancels active work and
  withdraws unadmitted queued inputs. Failure/ambiguous admission pauses draining and retains
  unsent text for explicit recovery. Disconnect does not abort Brunch; reload never autoplays
  history or resends queue contents. Queue storage is session-local, not durable.
- Failed, cancelled, stopped or unproven work cannot produce a final paraphrase. Invalidated
  generations cannot be revived by late events. A successfully completed explanation of a
  rejected/no-op domain tool result may speak; that is not a failed agent execution.
- Audio failure, truncation, or oversized source leaves canonical text intact and reports failure;
  never silently truncate source or automatically read the report. Exact Read full response and
  Repeat question remain optional independent delivery modes.

### Implementation sequence and owners

1. Session/policy tests first: output-only cancellation preserves capture; input completion order;
   explicit `acknowledgement`, `progress`, `paraphrase`, and exact-read requests; no domain tools.
   Implement in website `openai-realtime-session.ts`, server policy and diagnostics.
2. Panel/transport tests first: FIFO after full automatic continuation, withdrawal and error hold;
   expose admitted and terminal submission identity through existing callbacks. Implement in
   `ai-assistant-panel.tsx`, composer context, transport `index.ts`, panel tracker and Voice wiring.
3. Bridge/controller tests first: full success gate, immutable snapshots before queue drain,
   event-backed notices, overlap capture, cancelled/failed/textless continuation, replay/reopen.
   Remove parent stepwise speech and long-answer-offer normal path, not canonical content.
4. Preserve Brunch/core/SDCPN and typed contracts; only adjust app Voice presentation instructions.
   Update Voice user guide and a Petrinaut patch changeset with the queue/interrupt behavior.
5. Run affected unit/integration, type, lint and build checks; render real panel fixture and inspect
   queued/failure/listening states. Record evidence and remaining provider/human gates separately.

## Proof

- **Transport and turn safety:** `packages/transport-aisdk/test/chat-transport.test.ts`, website
  `realtime-brunch-bridge.test.ts` and `voice-browser-tools.integration.test.tsx` exercise full
  continuation completion, failure before text, ambiguous admission and Stop/late-event races.
- **Queue and capture:** panel composer/Voice integration tests plus website
  `openai-realtime-session.test.ts` and `voice-turn-controller.test.ts` distinguish reversed
  transcript completion, identical words with different IDs, input during acknowledgement,
  preserving input on output cancellation, FIFO, error hold, Stop withdrawal and no reload send.
- **Prompt and payload isolation:** `apps/brunch-agent/test/voice-context.test.ts`, session and
  policy tests assert unchanged typed behavior, no tools/autonomous response, completed-only
  source selection, exact replay and no cross-turn input in paraphrase context.
- **Product path:** actual local panel/browser-tool fixture with rendered-state inspection and
  DOM assertions; affected workspace unit/type/lint/build checks. Mocked provider checks establish
  wiring, not acoustic fidelity or naturalness. No deployment claim follows from local evidence.
- **Provider and human experiment:** only after explicit paid budget approval, synchronized audio
  and screen recording with pinned models/prompts/fixture/branches. Compare #9585, #9622 and this
  variant, plus acknowledgement on/off on this variant to isolate bridging. Human inspection of
  heard claims against canonical source, and canonical claims against tool evidence, separately.

### Measurements and oracles

Record speech-end, transcription completion, receipt/queue/admission, all continuation settlements,
whole-reply completion, request and playback events keyed by turn and speech request. Measure:
first audible acknowledgement; longest/total silence during Brunch work (separate user speech);
whole-reply completion to first substantive audible audio; fidelity/qualifications; unsupported
claims/questions/progress; lost/duplicate/reordered/misattributed queued turns; human naturalness.
Include queue wait and absence of an answer. Provider audio-buffer events are timing proxies only;
synchronized recording/human listening is the first-audible oracle. Operational logs contain only
scalar metadata, never source/transcript/audio. Consent-controlled artifacts may contain content.
Pin model/config differences; #9622 changes Brunch generation too, so not every difference is
caused by Realtime. No invented latency acceptance threshold or statistical claim from a few runs.

## Constraints

No Brunch-as-tool, delegation, independent Realtime domain reasoning, additional backend route,
parallel conversation store, core/SDCPN prompt rewrite, Flue dependency upgrade or patch expansion.
Retain the maintained local Flue 2.0.3 delivery-context exception from #9585 without representing
it as upstream support. Preserve exact user text routing, correlation and idempotency. Work only
in this sibling worktree; do not alter the current #9622 checkout or its uncommitted changes.
This authority change is committed separately before product work. The accepted design is the
semantic source; tests may falsify it, not silently redefine it.

## Fog-line

Prompting cannot guarantee faithful speech. Runtime gates prevent early/wrong-turn delivery and
tool access, not semantic hallucinations. Full-duplex capture may admit echo; real microphone and
speaker/headset witnesses remain necessary. Provider token budgets include audio and need measured
headroom. The inherited stopped-after-settled browser-work durability limitation remains, but this
session must never autoplay stopped work. Live Notion was inaccessible; the human-pasted transcript
was read and supports bridging, not this newly approved rephrasing/queue design. Existing preview
configuration and backend deployment remain unverified. Linear identity needs approval before
external submission. `gh stack` is unavailable; the local sibling uses ordinary Git ancestry.

## Stop or reorient

Stop on speech before complete success, fabricated progress, qualification loss, capture loss,
wrong-turn admission/playback, late autoplay after cancellation, or typed behavior leakage.
Do not widen architecture to fix naturalness without owner review. Text-first paraphrase then
validation/playback is a possible fallback if direct audio fails fidelity; persistent Realtime
with Brunch as a tool is a larger alternative, not selected by failure here. Human naturalness,
paid ceilings, external publication and mission acceptance remain owner decisions.

## Deferred

[MISSION.next.md](MISSION.next.md) and its existing linked drafts remain unchanged future context.
The inherited CORS mission and its SRE-1013/SRE-1042 deployment, FE-1615/FE-1616 authentication/rate
owners survive in the historical contract above; this experiment does not adjudicate or discharge
them. A future durable queue or text-first validation requires its own accepted scope and witness.
