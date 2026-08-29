# Voice-first elicitation: feasibility against the elicitation kernel

Resolves FE-1359. Written 2026-08-11 against
[`spec.md`](../../specs/elicitation-kernel.md) (draft assembled 2026-08-10, reviewed twice since),
the inbox note [voice-implementation-recommendation-pplx](../voice-implementation-recommendation-pplx.md),
the three prototype branches (`prototype/10-flue-roundtrip`, `prototype/11-capture-sweep`,
`prototype/13-sweep-seam`), and web verification of the provider landscape (sources at the end).

The spec mentions voice, audio, speech, and modality **zero times**. This is a genuinely new axis,
not an under-specified one.

## Executive summary

1. Verdict: **bolt-on with constraints** — but the bolt-on attaches at the **ui shell**, not as a
   provider-owned adapter in front of the harness, which is where the inbox note points it.
2. The inbox note's shape is disqualified on its own documented terms: Speech Engine returns **text
   only** (so no affordances reach the client), hands your server a flat `{role, content}` history
   (so §9.4 provenance cannot survive), exposes **no partial transcripts** (so the live-extraction
   beat is unbuildable), and has **no push-to-talk** (so the safe fallback is unavailable). OpenAI and
   Google don't admit an external LLM at all; buy standalone streaming ASR and TTS instead.
3. Voice-in over our existing Flue transport is additive: string-only inbound (§7.7) and the
   markdown floor (§7.2) already make the kernel modality-agnostic on the input side.
4. Three kernel mechanisms turn out to fit voice by accident: §5.1 already licenses tap-less uis to
   yield inferred-only absences, §8.3's content-keyed sweep idempotence already survives a
   mid-flight abort, and §7.3's one-live-affordance rule is _strengthened_ by a serial audio channel.
5. The deepest collision is not barge-in — it is that voice makes **endpointing** a ui-shell
   responsibility, and the ui is chartered to own no elicitation semantics (§4). Push-to-talk
   returns that judgment to the user and dissolves the collision; open-mic does not.
6. "The agent interrupts to clarify" has **no seam at all**: capability 7 is an end-of-agent-turn
   hook (§8.1, §10), and nothing in the ten capabilities evaluates anything _during_ the user's turn.
7. Live entity extraction is a second cheap-model pass that fits §11.4's "noticed, not yet asked"
   scratchpad, but **not** capability 6 during the user's turn — no dispatch is in flight to host it.
8. Biggest under-rated risk is evidential, not technical: ASR mangles exactly the proper nouns that
   get captured. This project's own meeting transcript renders "Petri net"/"Petrinaut" as
   **"PetriKnot" 35 times and correctly zero times**.

---

## (a) Collision analysis

Severity is scored for the September demo, not for the product's long run.

| #   | Collision                                                                           | Severity                               | Short resolution                                                    |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| C1  | Turn-loop latency vs. the suspend/fresh-dispatch cycle                              | **High**                               | Stream first sentence to TTS; keep continuation turns silent        |
| C2  | Barge-in vs. dispatch atomicity                                                     | Medium                                 | §8.3 idempotence already covers it; verify Flue client-abort        |
| C3  | Endpointing becomes a ui responsibility the charter withholds                       | **High** (conceptual)                  | Name a _turn shell_ with a one-way valve; push-to-talk collapses it |
| C4  | Agent-initiated interruption has no seam                                            | **High** (for the aspiration)          | Implement as forced endpointing in the turn shell, labeled honestly |
| C5  | Structured affordances have no audio form; the markdown floor is not a speech floor | Medium                                 | Add a speech rendition; keep a screen so taps survive               |
| C6  | One-live-affordance rule under audio                                                | **None** — it survives and strengthens | No action                                                           |
| C7  | ASR-mediated evidence vs. "only the true user's side is evidence" (§9.4)            | **High**                               | Audio pointer on spans, lexicon biasing, visible transcript         |
| C8  | TTS must inherit the `purpose`/`display` filter                                     | Low                                    | New explicit clause in the ui contract                              |
| C9  | Provider-owned conversation vs. single-authority durability (§9.1, §9.6)            | **High**                               | Buy audio primitives, not the conversation                          |

### C1 — Turn-loop latency vs. the suspend/fresh-dispatch cycle (High)

The kernel spends more than one model turn per user-visible question. §7.4 fixes the ask cycle as
`terminate: true` + pending-affordance slot + **the answer arriving as a fresh dispatch**. §8.1 then
adds a would-stop settlement check that "steers a settlement-check signal into a **same-response
continuation turn**." Ticket 10 measured a third turn — the wake wart, one wasted model call per ask
— which §7.4 removes by keeping the pending affordance out of the instructions, but the structural
point stands: a single spoken question can sit behind two or three sequential model invocations plus
a durable-submission round trip.

In text, a three-second gap between "Send" and the next question is invisible. In voice it is more
than the entire budget. LiveKit's published thresholds: **"under 500ms feels like talking to a
person," "under 1 second feels natural," "over 2 seconds feels broken."** Their component breakdown
for a well-tuned streaming cascade totals roughly 300–600ms — VAD 10–50ms, streaming STT partial
under 100ms, **LLM time-to-first-token 300–800ms (the slowest stage by far)**, TTS first chunk
100–200ms — against 1000–2000ms+ for a naive non-streaming cascade.

Read our turn structure against that breakdown and the problem states itself: **the budget allows
approximately one LLM time-to-first-token, and the kernel spends one to three sequential model
invocations plus a durable-submission round trip.** The audio stack is not the risk — ElevenLabs
quotes Scribe v2 Realtime at ~150ms, which is noise at this scale. The risk is the kernel's own turn
economy, and it is a design cost we chose for good reasons (harness-owned suspension, agent-judged
settlement) that voice now prices.

Worth noting too that cascaded-vs-native is not the axis that decides this. Native speech-to-speech
is cited at ~200–300ms in principle, but measured end-to-end time-to-first-audio across 2026 vendors
"clusters between 0.78s (xAI Grok Voice Agent) and 2.98s (Gemini 3.1 Flash Live)" — a slow native
model loses to a good cascade. Vendor and tuning dominate architecture; one production example
(Vapi + AssemblyAI) reports ~465ms end-to-end after tuning.

Resolutions, in order of leverage:

- **Speak the first sentence, not the finished turn.** Flue streams text deltas; the TTS sink should
  begin on the first sentence boundary. This is the single largest win and it is cheap.
- **Never let the settlement check precede the speech.** §8.1's continuation turn is silent work; if
  the ui speaks only text parts and the continuation emits diagnostics (§7.7), the ordering is
  already harmless — but it must be verified rather than assumed, because the seam "fires on
  suspensions too" (§8.1).
- **Keep asks short.** A pack-level style constraint, not a mechanism change.
- **Consider a filler.** This is the one place the managed path has something we would have to build:
  ElevenAgents exposes `soft_timeout_config` (0.5–8.0s, disabled by default) which "fills dead air via
  a filler message while your LLM is slow" rather than failing the turn. A hand-rolled equivalent —
  speaking an acknowledgement token while the sweep-and-settle turns run — is a few hours' work and
  buys back most of the perceptual gap. Worth doing at T1.

### C2 — Barge-in vs. dispatch atomicity (Medium)

Barge-in has three distinct cases and only one is interesting.

1. **User speaks over TTS playback of an already-suspended turn.** Harmless and the common case: the
   ask already terminated the turn, so playback is a ui artifact lagging behind a finished dispatch.
   The reply is a fresh dispatch exactly as §7.4 specifies. Nothing in the kernel notices.
2. **User speaks while a dispatch is mid-generation.** The harness has a partially emitted turn.
   Ticket 01 records Flue's durable-submission contract as "every accepted submission reaches
   exactly one durable terminal outcome — completed, failed, or **aborted**," with a retry budget and
   a wall-clock timeout "enforced preemptively via the attempt's abort signal." So `aborted` is a
   first-class terminal state; what is **unverified** is whether a client can initiate that abort,
   and what a second `dispatch` arriving during one in flight does. Both are cheap prototype
   questions and both are on the critical path.
3. **User speaks while a tool call is in flight** — the genuinely scary one, because that tool may be
   `sweep_range`. Here the kernel is already safe for an unrelated reason: §8.3 makes mechanical
   sweep idempotence "**load-bearing, not optional**, under at-least-once tool re-execution (Flue
   fact, ticket 13)," with content-keyed capture identity so "re-sweeping a range never
   double-captures **and can repair omissions**." An aborted-and-retried sweep is precisely the
   at-least-once case the spec already hardened against. Whole-sweep-atomic application (§9.2, §9.6)
   closes the other half.

The residual risk is therefore not corruption but _conversational_ incoherence: an aborted turn
leaves a truncated assistant entry in the durable log that the model will later re-read and that a
capture could, in principle, be anchored near. §9.4 keeps it out of evidence (only true-user entries
are citable), so this is cosmetic.

### C3 — Endpointing becomes a ui responsibility the charter withholds (High, conceptual)

This is the deepest collision and it is easy to miss because it looks like plumbing.

`CONTEXT.md` defines the ui as "the interface shell: whatever affords user interaction — rendering,
input, reply transport. **Not bound to GUI or TUI; a chat channel qualifies.**" §4 sharpens it: "the
ui renders parts and transports replies; **it owns no elicitation semantics**." Three jobs, no
judgment.

In a text ui the Send button is the endpointer, and the _user_ owns it — deciding that an utterance
is finished is a human act the interface merely records. In voice that judgment moves into software.
Whoever decides "this pause means the answer is over" is making a conversationally consequential
call: cut too early and you truncate a domain expert mid-thought and capture half a fact; cut too
late and the agent feels dead. That is elicitation semantics living in the ui.

2026 practitioner consensus is emphatic that this, not raw latency, is the hard part — and it is also
where the latency actually goes. Two quantifications worth carrying into the design conversation: "a
silence timeout set to 800ms adds nearly a full second to every single response before the pipeline
even starts," and Vapi's stock endpointing defaults "can add 1.5+ seconds to your response time —
completely negating all your other optimizations." Set against C1's 500ms/1s/2s thresholds, the
endpointing policy is a larger lever than any model choice. The tradeoff is irreducible and stated
plainly in the literature: "a lower threshold or a shorter horizon makes the agent commit to
end-of-turn sooner, which is faster but produces more false interruptions." The industry's answer is
learned turn-detection rather than energy thresholds — Pipecat's SmartTurnAnalyzer, LiveKit's
TurnDetector, semantic VAD that re-listens and issues a resume when the interrupting audio contains no
decipherable words.

Two consequences for us. Our interview domain is the _worst case_ for acoustic endpointing: a domain
expert describing a plant thinks in long sentences with mid-thought pauses, exactly the signal a
silence threshold misreads. And ElevenLabs' own answer here — `turn_eagerness: patient` alongside
`turn_timeout` (1–30s) — is real prior art worth copying conceptually even if we do not buy the
platform.

Resolution: **name the responsibility instead of smuggling it.** Add a fifth shell to the
architecture picture — a **turn shell** sitting between ui and substrate — whose whole job is
converting a continuous audio stream into discrete dispatches, and whose contract is a one-way
valve:

> The turn shell may synthesize user entries and abort dispatches. It may never write to the capture
> store, never interpret an answer, and never be citable as evidence.

Note what this buys: **push-to-talk is not a fallback, it is the conceptually clean mode.** It
returns endpointing to the user, shrinks the turn shell to a transcription pipe, and leaves §4's
three-job ui charter intact. The inbox note recommends push-to-talk defensively ("it protects the
demo from VAD ambiguity"); the stronger argument is architectural.

### C4 — Agent-initiated interruption has no seam (High for the aspiration)

The demo aspires to "the agent interrupts to clarify" during an audio description. Check the
capability list (§10) for a seam that could host that decision: capability 7 is "subscribe to the
**would-stop** lifecycle seam, with same-response signal steering" — an end-of-agent-turn hook.
Capabilities 5 and 9 are suspend-for-reply and signal injection. **Nothing in the ten capabilities
evaluates anything during the user's turn**, and by §7.4's design the turn is _suspended_ while the
user talks — there is no agent running to notice anything.

So agent-initiated interruption is either an eleventh capability (a during-user-turn evaluation
seam, which would be the first genuinely new mechanism voice demands) or it lives outside the kernel.

Resolution, and it is a good one: implement interruption as **forced endpointing in the turn shell**.
The same monitor loop that drives live extraction (see (b)) watches the partial transcript and, on
its own heuristic or a cheap-model judgment, decides to close the user's turn early and dispatch the
transcript-so-far. The kernel then sees a perfectly ordinary — merely shorter — user entry, and every
downstream invariant is untouched. What the audience experiences as the agent interrupting is
mechanically the edge deciding the user's turn is over.

Two honesty obligations. First, this is not agent judgment in the kernel's sense, and the demo
narrative should not imply the interviewing agent is exercising interviewing skill mid-monologue
unless the monitor is actually running a model call with the pack's guidance in it. Second, false
interruption is the named primary failure mode of this feature class in the 2026 literature — acoustic
VAD misfiring on mid-sentence pauses and throat-clears, with semantic VAD and learned turn-detectors
as the current mitigation — and unlike latency it reads as _rudeness_: one badly-timed interrupt in
front of an audience costs more than five seconds of silence would. Building agent-initiated
interruption means deliberately adding a false-positive channel to the one interaction where the
system's credibility is the product.

Note also what the managed voice platforms do _not_ give you here. Their interruption support is
uniformly user-interrupts-agent — Speech Engine's `AbortSignal`, ElevenAgents' `agent_response_correction`
event for a "truncated response after interruption," Gemini Live's "users can interrupt the model at
any time." Agent-interrupts-user is a different feature and none of the fetched docs offer it. This is
the one demo aspiration where no vendor is carrying any of the weight.

### C5 — No audio rendering for structured affordances; the markdown floor is not a speech floor (Medium)

Two separable problems.

**The epistemic one is already resolved in the spec, and the resolution is a real capability loss.**
§5.1 makes tap-ness a transport fact: the harness defines "a **reserved reply encoding** — a
sentinel-format string the ui emits for structured affordance taps," and only a reply parsing as that
encoding while its affordance is pending counts as transport-explicit; "every other reply is
conversational, and absences read from it carry `epistemic_status: inferred`." It then says the quiet
part out loud: "Structured taps are an **optional ui capability, not a requirement** … A ui that only
affords the markdown floor never produces the encoding and honestly yields inferred-only absences."

Voice is exactly that ui. **A voice-only elicitation can never produce an `explicit` absence.**
Every "not applicable" spoken aloud is `inferred`, forever, by design. That is honest and
pre-authorized — and it lands squarely on the absence strip, which is one of the demo's showpieces.
The fix is not a spec change but a product decision: **keep a screen.** In a voice+screen hybrid the
affordance still renders, the taps still work, the encoding still fires, and `explicit` survives.
The prototype's `send(choice)` path in
`prototypes/sweep-seam/src/ui/chat.tsx` is already the whole mechanism.

**The rendering one is a small genuine gap.** §7.2's floor is a _markdown_ floor, and markdown reads
aloud badly — bullets, backticks, tables, and code spans all become noise. Worse, questionnaire
chaining is defined as "**one affordance with multiple steps**, the payload carries all N questions,
**the ui walks them locally** … zero intermediate model turns." Walking N steps serially in audio
means the turn shell must speak Q1, endpoint, speak Q2 — a mini-interviewer in the ui, which is the
§4 breach again.

Resolutions: add a **speech floor** to the affordance envelope — a plain-prose or SSML rendition
alongside the markdown floor. It is a small, cheap amendment (a concept-schema-axis change, §12.6,
"cheap while the ecosystem is workspace-internal"). And in voice mode, collapse questionnaires to
their floor — speak the set, take prose back, let the model interpret at sweep time — or disable the
form. Do not let the turn shell walk steps.

### C6 — One live affordance under audio: survives, and strengthens (None)

Worth stating as a positive finding. §7.3 derives the one-live-affordance rule from transport truth
(the data channel is a last-write-wins "current-affordance surface, not a log") and enforces it as
mechanism: "the ask tool **rejects a second interactive affordance in the same batch**." Audio is
strictly serial — only one question can be in the air — so the audio channel wants exactly the same
rule for independent reasons.

Reply binding also survives. §7.4 makes binding harness-mechanical precisely because at most one
affordance is pending, "no echo token, and no reliance on the model remembering an id." A spoken
reply that wanders — answering an earlier question, or volunteering three facts and ignoring the one
asked — gets bound to the pending affordance anyway, and that is fine: binding is a hint, not an
interpretation. §7.4 puts interpretation at sweep time "citing the quoted reply text," and §7.5
already has `redirected` for "cancellation-by-topic-change." Voice produces more wandering replies
than text; the machinery for that was built already.

### C7 — ASR-mediated evidence (High)

The kernel's evidentiary claim is unusually strong. §5 makes each evidence span "a **quoted excerpt
plus a pointer**," with the excerpt "primary at proposal time and … the **model-facing citation
currency**." §8.2 has the harness resolve quotes to entries because "the model's quotes were
flawless and its sequence guesses never converged." §9.4 is titled "Provenance: only the true user's
side is evidence."

Under voice, the durable user entry is not the user's words — it is a machine transcription of them.
Every mechanism keeps working (both model and harness see the same transcript text, so quote
resolution gets _easier_, not harder), while the invariant's plain-English meaning quietly becomes
false. And the failure is not uniform noise: ASR breaks proper nouns and technical vocabulary, which
is precisely the population of things worth capturing.

The local evidence is stark. This project's own expert-meeting transcript
(`docs/reference/yannis-dora-lu-transcript-2026-08-11.md`), an ASR product's output on exactly the
conversation type the demo is imitating, renders the central domain noun as **"PetriKnot" 35 times
and "Petri net"/"Petrinaut" zero times**, and "STCPN" 14 times where the project's term is SDCPN —
a misreading that propagated into the human-written findings note. A demo that captured from that
transcript would produce evidence-anchored, correctly-swept, perfectly-idempotent captures about a
formalism that does not exist.

Resolutions, all cheap, and the first two are worth doing even for a demo:

- **Show the transcript and let the user correct it.** Already the demo's own aspiration ("live
  transcription runs"), so it costs nothing extra and it converts the risk into a feature.
- **Bias the ASR with the plugin's vocabulary.** This is a solved, cheap, well-supported feature and
  it is the highest-value single mitigation. §13.1 already gives `plugin-gherkin` "a pack-declared
  **step-lexicon**"; a target's lexicon _is_ the biasing list. This introduces a new read-only
  plugin → turn-shell flow, admissible on the same footing as form tags (the ui already keys rendering
  on plugin form tags, §7.2) — it carries no elicitation semantics. Options, with the caveat that all
  vendors describe biasing as hints: **Deepgram Nova-3** keyterm prompting (100 terms, no retraining,
  ~150ms first partial, mature browser SDKs); **AssemblyAI Universal-Streaming** keyterms (100 terms,
  $0.15/hr, the cheapest verified rate, self-reported — so treat sceptically — as 21% more accurate
  than Nova-3 on domain terms); **ElevenLabs Scribe v2 Realtime**, which notably biases toward terms
  only when actually spoken rather than force-inserting them, unlike Whisper-style prompting that
  "often insert[s] prompted terms where they don't belong… especially on ambiguous audio" — a real
  distinction, since a forced insertion is _worse_ than a misrecognition when the output becomes
  evidence; and **OpenAI**'s `keywords` on a transcription session, documented for "product names,
  acronyms, and other literal terms," with "keywords are hints, not required output."
  **Unresolved:** two passes over the ElevenLabs docs returned conflicting realtime keyterm caps —
  50 terms × 20 chars on the speech-to-text capability page versus 100 terms × 50 chars elsewhere.
  The cap matters for how aggressively a pack lexicon must be pruned, so confirm it before designing
  that pruning. Either way a cap exists and a full domain lexicon will exceed it.
- **Mark voice-derived captures**, and require on-screen confirmation before a voice-derived proper
  noun reaches `explicit`.
- **Longer-term: add an audio pointer to the evidence span.** Keep the audio, point at it by
  timestamp, and the excerpt becomes navigable back to the actual utterance. This is the honest fix
  and it is a §12.6 concept-schema-axis change — cheap now, expensive later.

### C8 — TTS must inherit the display filter (Low)

§7.7: messages carry `purpose` and `display`, "**the ui must filter on them** (injected signals
arrive `display: 'diagnostic'`)." The speech layer needs the same clause, stated separately, because
the failure mode is loud: §8.1's settlement nudge "is itself a session entry," §9.3's re-entry
briefing is an injected state message, and the prototype ui renders tool parts and sweep JSON
inline. A naive "speak all text" implementation reads the agent's own bookkeeping aloud.

Also: §9.3 requires "a **minimal user-visible insertion notice**" with every injected state message.
Voice needs an audible equivalent — an earcon, or a screen-only notice in the hybrid shape. Trivial,
but it is a contract clause that currently has no audio answer.

### C9 — Provider-owned conversation vs. single-authority durability (High)

This collides with the _recommended architecture_ rather than with voice itself, and it is the one
place I dissent from the inbox note.

First, a naming correction the note gets wrong and that matters for anyone reading its links.
ElevenLabs currently ships **two** relevant products, and Speech Engine is not a rename of the
older one:

- **ElevenAgents** (`/docs/eleven-agents/`) is the hosted agent platform, descendant of
  "Conversational AI"/"Agents Platform" — confirmed by redirect, `/docs/conversational-ai/overview`
  → `/docs/eleven-agents`. Its **Custom LLM** feature is the classic HTTP contract: "it must align
  with one of the following OpenAI-compatible request/response structures: Chat Completions API
  (`/v1/chat/completions`) [or] Responses API (`/v1/responses`)", replying SSE with
  `ChatCompletionChunk` frames terminated by `data: [DONE]`.
- **Speech Engine** (`/docs/overview/capabilities/speech-engine`) is a separate, newer, additive
  product and is what the note actually recommends. It is **not** a POST-to-your-endpoint contract:
  you attach a server via `elevenlabs.speechEngine.attach()` over a persistent SDK/WebSocket
  connection, and your `onTranscript` handler receives the history and session each turn. No required
  path or schema; not OpenAI-compatible by requirement.

Either way the division of labour is the note's: the provider owns audio, turn-taking, and
interruption detection, while "your server provides the LLM logic." Speech Engine "adds voice
capabilities to any chat agent," the SDK "manages conversation turns, so your server only needs to
respond to transcripts," and it cancels an in-flight LLM call "automatically via an `AbortSignal`" —
a positive interruption signal rather than silence inference, which is genuinely nicer than what we
would build.

It is a clean pattern for a stateless chat agent. Against this kernel, its documented surface is
disqualifying on four counts — and then, decisively, on the demo's own live-transcription aspiration.

1. **The return channel is text, full stop.** The JS SDK's only outbound path is
   `session.sendResponse()`, accepting `string | AsyncIterable<unknown>`; the docs list no mechanism
   for structured data back to the client. But capability 4 is "emit an affordance payload" via "data
   channel + tool output parts" (§10), and §7.3 makes durable affordance identity ride the ask tool's
   output part. So every choice strip, absence strip, questionnaire and interpretation render needs a
   parallel channel to the browser _anyway_ — at which point the provider transports half the
   conversation and we transport the other half, with two orderings to reconcile.
2. **The provider's history model cannot represent ours.** `onTranscript(transcript:
TranscriptMessage[], signal, session)` receives the history as `{ role: "user" | "agent"; content:
string }` on every turn. There is no room in that shape for tool parts, affordance output parts,
   or — critically — §9.4's distinction between true-user entries and injected on-behalf-of-user
   signals, which the kernel needs _mechanically_ ("a capture citing an injected entry is refused at
   validation"). Meanwhile §9.1 makes the capture store plus session logs authoritative and §9.6
   binds evidence pointers to the target-document's own archive "so evidence pointers resolve against
   the target-document's own store, **never against whatever the substrate happens to retain**." A
   provider-held history is a third copy, lossy in exactly the dimension the kernel's provenance
   invariant lives in.
3. **Our turn is not one text response.** `terminate: true` mixed batches (§7.7: "mixed batches
   suspend correctly when the terminating result is present") and §8.1's same-response continuation
   turn mean model work continues _after_ the user-facing answer. Both integrations are
   turn-shaped — one `onTranscript` in, one `sendResponse` out; one `/v1/chat/completions` request,
   one SSE stream — and neither documents a slot for further model work once the turn's text is
   delivered.
4. **The provider becomes the turn shell** — C3's judgment handed to a vendor, behind an extra async
   hop. ElevenAgents does expose real controls over that judgment (`turn_timeout` 1–30s,
   `turn_eagerness` patient/normal/eager, a `vad_score` event, `user_activity` to suppress
   interruption during silence), which is more than nothing. But **push-to-talk / manual turn-end is
   not documented in either product** — checked directly against the conversation-flow page — so the
   demo-safe fallback is unavailable on this path, and their direction of travel is away from it
   (a first-party blog describes "speculative turn-taking" reading conversational flow rather than any
   hard threshold).

And the finding that should settle it: **the agent products expose no partial transcripts.** For
Speech Engine, "the full transcript is passed to `onTranscript` on every turn," with no
intermediate/partial mechanism documented and `"user_transcript"` as the only transcript event; on
ElevenAgents `user_transcript` is explicitly "finalized speech-to-text results." The demo's headline
beat — live transcription with entities appearing as the conversation goes — is not implementable on
the integration the note recommends. Partials exist at ElevenLabs, just one layer down, in the raw
ASR product.

The same holds for the other vendors, and it is worth stating flatly: **neither OpenAI nor Google
supports putting your own model in a realtime voice session.** OpenAI's docs "provide no information
about using third-party LLMs — all references assume OpenAI's models are in the loop," and
practitioners confirm you cannot reliably load assistant audio or a multi-message history into a
Realtime session. Gemini Live is explicit: "the Live API documentation makes no provision for
substituting an alternative LLM within a session. All reasoning and response generation occurs within
the Gemini model selected at session initialization" — and its half-cascade models, which allowed
swapping _TTS only_, are narrowing rather than expanding. Gemini Live also remains "in Preview."

Resolution: **buy the provider's audio primitives, not its conversation.** The pieces all exist
standalone; the honest caveat is that **"ASR + your own LLM + TTS" is not a named, documented pattern
at any of these vendors** — you assemble it from parts, which is a modest integration risk rather than
a blocker.

Input (streaming ASR with partials, push-to-talk, and vocabulary biasing — see C7 for the biasing
comparison):

- **OpenAI transcription-only Realtime sessions** — `gpt-live-transcribe`, "text from a microphone…
  without a spoken assistant response," partials as
  `conversation.item.input_audio_transcription.delta` and finals as `…transcription.completed`.
  Push-to-talk is first-class and documented in as many words: `turn_detection: null` is "useful for
  interfaces where you would like to take granular control over audio input, like push to talk
  interfaces," then `input_audio_buffer.commit`. Server VAD defaults to 500ms silence, with
  `semantic_vad` available as a middle ground; practitioners raise it to 800ms–1s for interview-shaped
  conversations, which is exactly our case.
- **ElevenLabs Scribe v2 Realtime** — client-side or server-side WebSocket streaming, ~150ms, word-level
  timestamps, "delivers partial transcripts as you speak and committed transcripts when a speech
  segment completes," with manual commit or VAD auto-commit.
- **Deepgram Nova-3 / AssemblyAI Universal-Streaming** — the two best-documented choices for biasing
  specifically, and the ones to default to if C7's accuracy spike goes badly (C7).

Output (streaming TTS from our own text):

- **ElevenLabs TTS WebSocket** — `/v1/text-to-speech/{voice_id}/stream-input`, built for partial-text
  chunk input from an LLM token stream, which is exactly C1's first-sentence-streaming requirement.
  Note it does not support the `eleven_v3` model.
- **OpenAI Realtime as a speaker** — a sanctioned trick rather than a product: `response.create` with
  `input: []` and `instructions: "Say exactly the following: <text>"`, with OpenAI noting
  `gpt-realtime` is good at "reading disclaimer scripts word-for-word." Useful if we are already
  holding a Realtime session for transcription. Its documented **out-of-band responses**
  (`response.conversation: "none"`) are also the closest vendor analogue to (b)'s side-channel
  extraction pass — worth knowing exists, not worth adopting.

Either sits beneath our existing Flue transport, which the prototype already has working
(`useFlueAgent({ url })` and `agent.sendMessage(text)` in `prototypes/sweep-seam/src/ui/chat.tsx`;
ticket 01 confirms `@flue/sdk`'s `createFlueClient` for non-React hosts). One conversation authority,
one transport, voice strictly additive.

The honest cost of dissenting from the note: we then own microphone handling, echo cancellation,
endpointing, and interruption plumbing — real engineering the managed path gives away. Push-to-talk
removes nearly all of it, which is the third independent argument for push-to-talk.

---

## (b) The live-extraction beat

"Entities extracted as the conversation goes, shown in a running list" needs four things beyond an
ASR/TTS adapter:

1. **Streaming ASR with partial results**, not per-turn finalized transcripts. This is the
   requirement that eliminates the managed-agent path outright (C9): Speech Engine hands you "the full
   transcript … on every turn" and documents no partials, and ElevenAgents' `user_transcript` is
   "finalized speech-to-text results." The standalone STT products do supply them — Scribe v2 Realtime
   "delivers partial transcripts as you speak," or
   `conversation.item.input_audio_transcription.delta` on an OpenAI transcription session.
2. **A debounced second model pass** over the growing transcript — cheap model, rolling window,
   triggered on ~1–2s of silence or ~N new words rather than per partial. Per-partial is both
   expensive and visually unstable.
3. **A stable-keyed display list**, so entities do not flicker and reorder as the transcript
   revises. This is more of the work than it sounds.
4. **A promotion rule** — what, if anything, carries from this list into the real capture path.
   Answer below: nothing automatic.

### Does it fit capability 6?

**Not during the user's turn, no.** Capability 6 is "private model call — native (`harness.prompt`
scratch conversation)" (§10), and a `harness.prompt` call is only reachable from inside an agent
render or tool execution. By §7.4's design the turn is _suspended_ while the user speaks: there is no
dispatch in flight to host the call. Ticket 01 adds the matching constraint on the output side —
`useDataWriter` streams data parts "strictly one-way out of the agent," and "a write never
re-renders the agent" — so a data part can carry the running list _while an agent turn is running_
and cannot otherwise.

Two placements, and they trade liveness against containment:

**(1) Per-turn, inside the kernel.** Run extraction as a private model call at the top of the agent's
turn — Flue's `useAgentStart` is the documented async load-data seam (ticket 01) — and stream the
list out as a data part. This fits capability 6 exactly, needs no new capability, and touches the
main loop not at all: it is a side call whose output is display-only. Cost: the list updates at turn
boundaries. For a 5–20s conversational exchange that reads as live; for the demo's _long audio
description of a system_, the panel sits empty for minutes and then fills at once. Which is exactly
the beat the demo wants to avoid.

**(2) Continuous, outside the kernel.** The turn shell runs the pass over partial transcripts and
renders the list itself. True "as the conversation goes" behaviour, no kernel contact, and it is the
same monitor loop C4's interrupt heuristic needs — one watcher, two outputs (entities noticed,
interrupt-now?). This is the demo answer.

### The rule that keeps (2) safe

The spec already has the concept, and it is the right one. §11.4 names "a **private,
non-authoritative scratchpad** for 'noticed, not yet asked' — **not** harness session state." The
running entity list _is_ that scratchpad made visible. Therefore:

> The extraction pass produces noticing, never capture. Its output never becomes a capture, never
> reaches the model, and is never citable as evidence. Captures still arrive only through
> agent-judged settlement and sweep (§8.1, §8.3).

And a presentation requirement that follows from it: **the running list must be visually distinct
from the target-document panel.** The prototype already renders those separately (`StorePanel`
polling `/store/:targetId` beside the chat), and that separation is now load-bearing. If a demo
audience reads the live list as "the system captured these," then the product's actual
differentiator — evidence-anchored, agent-judged, idempotent capture — is invisible, and the demo has
accidentally sold a much weaker product that any streaming NER pipeline could deliver.

There is a real upside available here too. The list is the natural place to show what the kernel can
do that a NER pipeline cannot: an entity moving from _noticed_ to _captured with an epistemic status
and a quoted span_, on screen, when the sweep lands. That transition is the demo's best single beat
and it costs only wiring, since both panels already exist.

---

## (c) Verdict

**Bolt-on with constraints.** Not an architectural rewrite, and not an unconstrained bolt-on either.

The case for "not a rewrite" is concrete: every load-bearing kernel mechanism survives voice
unchanged — string-only inbound replies and the ui's `purpose`/`display` filter (§7.7), the markdown
floor and its optional-tap licence (§7.2, §5.1), one live affordance and mechanical reply binding
(§7.3, §7.4), `terminate: true` + fresh dispatch (§7.4), content-keyed sweep idempotence under
at-least-once execution (§8.3), harness-resolved quote anchoring (§8.2), and the private model call
(§10, capability 6). Two of them — §5.1's inferred-only degradation and §8.3's abort tolerance — fit
voice by accident, because both were designed for other reasons that happen to generalize.

What voice genuinely adds is one new shell responsibility (endpointing, and with it interruption) and
two small envelope additions (a speech rendition beside the markdown floor; an audio pointer on
evidence spans). One capability gap exists and should be left open on purpose: a during-user-turn
evaluation seam. Do not add it for September.

### Constraints, enumerated

1. **Voice attaches at the ui/turn shell.** Flue remains the only conversation authority; a provider
   supplies ASR and TTS, not the session. Default picks: an OpenAI transcription-only session or
   Deepgram/AssemblyAI for input (all three document push-to-talk and keyterm biasing), ElevenLabs' TTS
   WebSocket for output. (C9, C7)
2. **Turn-shell one-way valve.** It may synthesize user entries and abort dispatches; it may never
   write captures, interpret answers, or be citable as evidence. (C3)
3. **TTS inherits the display filter.** Diagnostics, injected signals, and tool narration are never
   spoken; injected briefings get an audible or on-screen insertion notice. (C8, §7.7, §9.3)
4. **Keep a screen.** Voice+screen preserves structured taps and therefore `explicit` absences;
   voice-only is honestly inferred-only and must be described that way. (C5, §5.1)
5. **The live entity list is scratchpad**, visually separated from the target-document panel, never
   fed to the model, never promoted automatically. (b, §11.4)
6. **Voice-derived captures are marked**; proper nouns get lexicon biasing and on-screen
   confirmation before `explicit`. (C7)
7. **Questionnaires collapse to their speech floor in voice mode**, or are disabled there. The turn
   shell never walks multi-step forms. (C5, §7.2)
8. **Add a speech rendition** alongside the markdown floor — small §12.6 concept-schema change. (C5)

### Minimal demo-safe shape

Ship the lowest tier that tells the story; rehearse the next one behind a toggle.

- **T0 — push-to-talk voice-in, text-out.** Live partial transcript on screen, affordances rendered
  and tappable as today, no TTS, no VAD, no barge-in. The user owns endpointing, so C3 and C4 do not
  arise and C1 barely bites. Both candidate STT products support this directly — OpenAI documents
  manual turn detection with `input_audio_buffer.commit` as a first-class mode. This already
  demonstrates "describe your system out loud and watch it become structure," which is the actual
  claim.
- **T1 — add TTS out**, first-sentence streaming, with press-to-talk cancelling playback as the only
  barge-in. Still no VAD.
- **T2 — add the continuous extraction pass** and the running entity list, with the noticed →
  captured transition wired as the showpiece beat.
- **T3 — open mic + agent-initiated interruption.** Provider VAD or turn-detection model, forced
  endpointing for interrupts. Stretch only; demo behind a toggle and rehearse T1 as the fallback in
  the same session.

The honest read is that **T0–T2 delivers the demo's narrative and T3 delivers its adjectives.**
"Interrupts to clarify" is the most fragile item on the aspiration list and the least load-bearing
for the argument the demo is making.

### What to prototype first

One spike, three numbers, on the existing `prototype/13-sweep-seam` branch rather than anything new.

1. **Measure the loop.** Instrument end-to-end wall clock for one ask cycle: user dispatch → model →
   ask tool `terminate` → part on the client, including §8.1's settlement continuation turn. Then add
   a streaming-ASR mic and a TTS sink at the two edges of `chat.tsx`'s `send()` and text-part render.
   The number that decides the demo is time-to-first-audio after the user stops speaking, read against
   LiveKit's thresholds: under 1s is natural, over 2s "feels broken." Given that a single LLM
   time-to-first-token is 300–800ms and our cycle contains one to three of them plus a
   durable-submission hop, the honest prior is that we land past 2s on the first attempt. If tuning
   cannot get it under that, T0 (silent, text-out) becomes the _right_ answer rather than the safe one.
   This retires the biggest risk because it is the only one that can invalidate the whole aspiration.
2. **Measure domain-term accuracy**, with and without lexicon biasing, on real audio — the
   Yannis/Dora recording if it exists, where the current transcript scores 0/35 on the project's own
   central noun. This retires the risk that the demo captures confident nonsense.
3. **Answer two Flue questions** (cheap, half a day): can a client abort an in-flight submission, and
   what happens when a second `dispatch` arrives while one is in flight? Both are needed for any
   barge-in beyond press-to-talk-cancels-playback.

### Effort estimate

Labeled explicitly as an estimate: one engineer, **on top of a working kernel loop**, and excluding
the Petri-net projection and residual-questions render (those are plugin work, not voice work).

| Tier                                        | Estimate                                  |
| ------------------------------------------- | ----------------------------------------- |
| T0 (push-to-talk voice-in, live transcript) | 2–4 days                                  |
| T0 + T1 (TTS out, playback cancel)          | ~1 week                                   |
| T0–T2 (+ live extraction panel)             | 1.5–2 weeks                               |
| T3 (open mic, agent interruption)           | +3–4 weeks, with an unbounded tuning tail |

The dominant caveat is not about voice at all. **This repository currently contains no product
code** — `main` holds a spec, a map, thirteen resolved tickets and `CONTEXT.md`; the only executable
artifacts are the three prototype branches. In a five-week window the kernel's milestone one is the
critical path, and T3's tuning tail would consume it. Recommended commitment: **T0 and T1 in scope,
T2 as the stretch that most improves the demo per day spent, T3 explicitly out** — revisited only if
the kernel loop is demonstrably done with two weeks to spare.

---

## Sources

Spec and repo (primary):

- [`spec.md`](../../specs/elicitation-kernel.md) §4, §5, §5.1, §7.2–§7.7, §8.1–§8.3, §9.1–§9.6, §10,
  §11.4, §12.6, §13.1
- [`CONTEXT.md`](../../../CONTEXT.md) — ui-shell definition
- [`issues/01-flue-architecture-deep-read.md`](../../archive/elicitation-kernel/issues/01-flue-architecture-deep-read.md)
  — durable-submission terminal outcomes and abort signal; `useDataWriter` one-way; `useAgentStart`
  load-data seam; `@flue/sdk` for non-React hosts
- [`issues/10-walking-skeleton-flue-roundtrip.md`](../../archive/elicitation-kernel/issues/10-walking-skeleton-flue-roundtrip.md)
  — turn suspension proven, wake wart, update-in-place data channel
- `prototypes/sweep-seam/src/ui/chat.tsx` on `prototype/13-sweep-seam` — the existing reply
  transport (`useFlueAgent`, `agent.sendMessage(text)`), tap-as-string, `StorePanel`
- [`docs/reference/yannis-dora-lu-transcript-2026-08-11.md`](../yannis-dora-lu-transcript-2026-08-11.md)
  — the ASR-fidelity evidence

Provider and practice (web, fetched 2026-08-11):

- [`docs/reference/voice-implementation-recommendation-pplx.md`](../voice-implementation-recommendation-pplx.md)
  — the prior recommendation this document refines and partly dissents from
- [ElevenLabs Speech Engine overview](https://elevenlabs.io/docs/overview/capabilities/speech-engine)
  — "adds voice capabilities to any chat agent"; "your server provides the LLM logic"; SDK "manages
  conversation turns"; interruption cancels the in-flight LLM request "via an `AbortSignal`"
- [Speech Engine JavaScript SDK reference](https://elevenlabs.io/docs/eleven-api/resources/libraries/speech-engine/javascript-sdk-reference)
  — `onTranscript(transcript: TranscriptMessage[], signal, session)` with
  `{ role: "user" | "agent"; content: string }`; `session.sendResponse(string | AsyncIterable)`;
  "the full transcript is passed to `onTranscript` on every turn"; no partial transcripts; "no
  explicit push-to-talk or turn-initiation API exists"; no structured data channel to the client
- [ElevenLabs speech-to-text](https://elevenlabs.io/docs/capabilities/speech-to-text) — Scribe v2
  Realtime, "Low latency (~150ms)", "precise word-level timestamps", keyterm prompting (realtime: 50
  terms × 20 chars; batch: 1000 × 50); links to a client-side-streaming WebSocket guide
- [ElevenAgents custom LLM](https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm) —
  the OpenAI-compatible contract: "must align with one of the following OpenAI-compatible
  request/response structures: Chat Completions API (`/v1/chat/completions`) [or] Responses API
  (`/v1/responses`)", SSE with `ChatCompletionChunk` frames and `data: [DONE]`; request fields
  `messages`, `model`, `temperature`, `max_tokens`, `stream`, `tools`, `elevenlabs_extra_body`; no
  `conversation_id` documented. Turn controls (`turn_timeout` 1–30s, `turn_eagerness`,
  `soft_timeout_config`, `user_activity`, `vad_score`, `agent_response_correction`) from the same
  product's conversation-flow docs; **push-to-talk / manual turn-end not documented** (checked
  directly). Naming confirmed by redirect: `/docs/conversational-ai/overview` → `/docs/eleven-agents`
- ElevenLabs realtime STT — [client-side streaming](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming),
  [server-side streaming](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/server-side-streaming),
  [capability overview](https://elevenlabs.io/docs/capabilities/speech-to-text) — Scribe v2 Realtime,
  "~150ms", word-level timestamps, "delivers partial transcripts as you speak and committed
  transcripts when a speech segment completes", manual or VAD-based commit. **Keyterm cap unresolved:
  50 × 20 chars on one page, 100 × 50 chars on another**
- [ElevenLabs TTS WebSocket](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input)
  — `/v1/text-to-speech/{voice_id}/stream-input`, built for partial-text chunks from a token stream;
  no `eleven_v3` support
- [OpenAI Realtime guide](https://developers.openai.com/api/docs/guides/realtime) — models
  `gpt-realtime-2.1`, `gpt-realtime-translate`, `gpt-live-transcribe`; GA-vs-preview per model **not
  confirmed**; no documented pattern for an external LLM in-session
- [OpenAI realtime transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription)
  — transcription-only sessions on `gpt-live-transcribe`;
  `conversation.item.input_audio_transcription.delta` / `.completed`; manual turn detection
  (`turn_detection: null` "useful for… push to talk interfaces", then `input_audio_buffer.commit`);
  `keywords` biasing "for product names, acronyms, and other literal terms", "hints, not required
  output". (A second research pass did not find the `keywords` field; the quote above is from a direct
  fetch of this guide.)
- [OpenAI out-of-band responses cookbook](https://developers.openai.com/cookbook/examples/realtime_out_of_band_transcription)
  — `response.conversation: "none"` for side processing; and the "say exactly the following"
  text-in/audio-out pattern from the Realtime conversations docs
- [Latent Space, OpenAI Realtime deep-dive](https://latent.space/p/realtime-api) — "it is currently
  not possible… to retrieve the conversation context via the OpenAI Realtime API, to load 'assistant'
  audio messages into the context, or to load a multiple-message history reliably"; endpointing
  practice (500ms default, 800ms–1s for interview bots)
- [Gemini Live API](https://ai.google.dev/gemini-api/docs/live-api) — "The Live API is in Preview";
  "users can interrupt the model at any time"; transcripts of both input and output; function calling;
  **no provision for substituting an alternative LLM** — "all reasoning and response generation occurs
  within the Gemini model selected at session initialization"; native-audio models are audio-output
  only; half-cascade (TTS-swap) availability narrowing. Manual-VAD/push-to-talk equivalent **not found**
- [LiveKit, sequential pipeline architecture](https://livekit.com/blog/sequential-pipeline-architecture-voice-agents)
  — "under 500ms feels like talking to a person", "under 1 second feels natural", "over 2 seconds feels
  broken"; cascade breakdown (VAD 10–50ms, STT partial <100ms, LLM TTFT 300–800ms, TTS 100–200ms;
  ~300–600ms streaming total vs 1000–2000ms+ naive); native S2S ~200–300ms
- Turn-taking and semantic VAD (2026 practitioner sources):
  [inworld.ai on semantic VAD](https://inworld.ai/resources/what-is-semantic-vad),
  [gradium.ai](https://gradium.ai/content/semantic-vad-voice-agents-turn-detection-2026),
  [futureagi.com](https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026) — the 800ms-timeout
  and Vapi 1.5s+ figures, the faster-endpointing/more-false-interruptions tradeoff, Pipecat
  SmartTurnAnalyzer / LiveKit TurnDetector
- Vendor latency comparisons (secondary, treat as indicative): QubitTool's April 2026 round-up
  (end-to-end TTFA clustering 0.78s–2.98s; per-component figures),
  [AssemblyAI on Vapi tuning](https://assemblyai.com/blog/how-to-build-lowest-latency-voice-agent-vapi)
  (~465ms end-to-end)
- Biasing options: [Deepgram keyterm prompting](https://developers.deepgram.com/docs/keywords)
  (Nova-3, 100 terms), [AssemblyAI streaming keyterms](https://assemblyai.com/blog/streaming-keyterms-prompting)
  (100 terms, $0.15/hr, self-reported 21% over Nova-3 — vendor claim, not independently verified)

Still unverified after this pass: per-model GA-vs-preview status on OpenAI Realtime; Gemini Live's
push-to-talk equivalent and session limits; the ElevenLabs realtime keyterm cap (two conflicting
numbers); and ElevenLabs Scribe base pricing. None of these change the recommendation. One claim in
C4 — that a badly-timed interrupt costs more in front of an audience than silence does — is
presentational judgment, not a sourced finding.
