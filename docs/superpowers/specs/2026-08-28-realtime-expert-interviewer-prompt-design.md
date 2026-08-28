# Realtime Expert Interviewer Prompt Design

## Goal

Make the spoken Petrinaut interview present as an expert process-model
elicitation interviewer without transferring interview authority from Brunch to
OpenAI Realtime.

The person speaking is the domain expert. Brunch remains the semantic
interviewer: it chooses questions, records evidence, updates interview state,
and decides completion. OpenAI Realtime remains the media plane that recognizes
speech, detects turns, invokes the Brunch continuation, and speaks canonical
Brunch output.

## Evidence

- [H-6763](https://linear.app/hash/issue/H-6763/support-for-realtime-audio-interviewing-of-domain-experts)
  defines the human as the domain expert and requires the elicitor to ask
  follow-up and clarifying questions.
- [Eliciting SDCPNs: open questions](https://app.notion.com/p/3b93c81fe024801b89b3cf63a9a6ff20)
  describes an agent interviewing a domain expert and emphasizes strategic
  probing, testing interpretations, and objective-relative completeness.
- [H-6763 realtime voice integration comparison](https://app.notion.com/p/3c73c81fe02481b986e1f9264cc9bf70)
  explicitly excludes the voice provider from acting as the semantic
  interviewer.
- [Running user interviews](https://app.notion.com/p/6fe8b5e3be1c4083a0e3d433380e9527)
  recommends a friendly, professional, neutral interviewer who listens
  actively, starts broad, avoids leading answers, and gives the expert room to
  think.
- [Eliciting and constructing processes → Petri nets](https://app.notion.com/p/3c83c81fe02480859eeef6b0054591d8)
  lists process-model content for the semantic interviewer to investigate and
  sketches how settled content might later project to Petri-net building
  blocks.
- FE-1403 and the Brunch repertoire already place research-derived elicitation
  behavior in Brunch, including evidence discipline, ambiguity handling,
  probing, and respectful close.

## Layer Boundary

The linked process-to-Petri-net document informs two layers below Realtime; its
question catalogue must not be copied into the media-plane prompt:

1. **Realtime voice plane:** Presents the expert-interviewer identity, detects a
   complete spoken turn, calls `continue_interview`, and delivers canonical
   Brunch text with appropriate voice presence.
2. **Brunch semantic interviewer:** Decides what to investigate. The current
   SDCPN plugin already represents goals and safety as objectives and
   constraints; failures and retries as event-shaped activities and exception
   sweeps; triggers as flow, boundary conditions, or dynamics thresholds;
   actors and resources as entity types, performers, availability, capacity,
   and contention policies; and steps as activities with preconditions,
   outcomes, duration, occurrence, ordering, and branch decisions.
3. **Projection:** Converts settled, provenance-bearing interview evidence into
   Petri-net modules. Realtime neither sees nor applies these transformations.

The rough process-to-Petri-net document also exposes possible semantic follow-up
work: locations have no explicit kind or required slot; consumed,
reserved/released, and read-only inputs are not distinguished by a dedicated
slot; and success/failure outputs and probabilities are represented only
indirectly. Those are Brunch plugin questions and remain outside this prompt
change.

Before its probabilistic branching sketch becomes projection guidance, its
comparison must be corrected: for a uniform sample in `[0, 1)`, an outcome with
probability `p` normally succeeds when `sample < p`, not when `sample >= p`.

## Prompt Design

The Realtime session prompt will use explicit sections for:

1. **Role and objective:** Realtime is the user-facing voice of an expert
   process-model elicitation interviewer, and the person speaking is the domain
   expert.
2. **Personality and delivery:** The voice is warm, calm, curious, confident,
   concise, and professionally neutral. It uses a measured conversational pace
   and natural emphasis without sounding robotic, fawning, rushed,
   overenthusiastic, or patronizing. It treats the speaker as the authority on
   their system.
3. **Authority:** Brunch remains the sole authority for interview content,
   state, captures, completion, and business decisions. Realtime does not
   invent, alter, summarize, or answer interview questions.
4. **Turn handling:** After semantic turn detection identifies one complete
   spoken answer, Realtime calls `continue_interview` exactly once and emits no
   preamble or conversational text first.
5. **Canonical output:** After the tool result, Realtime speaks only the
   `response_text` strings in order and verbatim, using the defined expert
   delivery style.

The canonical-response instruction used for initial and keyboard-triggered
Brunch output will receive the same delivery guidance. This is necessary
because those responses carry response-level instructions separate from the
session prompt.

## Changes

- Update `REALTIME_INSTRUCTIONS` in
  `apps/petrinaut-website/src/server/voice/openai-voice-policy.ts`.
- Update `CANONICAL_RESPONSE_INSTRUCTIONS` in
  `apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.ts`.
- Update tests that pin both instruction paths.
- Add a concise user-facing description of the interviewer delivery to the
  Petrinaut AI assistant guide.

## Non-goals

- Do not make OpenAI Realtime the semantic interviewer.
- Do not duplicate Brunch's elicitation repertoire in the media-plane prompt.
- Do not change tool schemas, turn correlation, interview state, completion,
  transcription, or projection.
- Do not add voice-mode context propagation into Brunch in this change.

## Verification

- Unit tests assert the full server-owned Realtime session prompt.
- Session tests assert that canonical speech requests include the expert
  delivery instruction while retaining verbatim output and disabled tools.
- Existing bridge and integration tests continue to establish that exactly one
  complete answer reaches Brunch and only canonical Brunch output is spoken.
- Relevant targeted tests, TypeScript checks, ESLint, and formatting checks
  pass.
