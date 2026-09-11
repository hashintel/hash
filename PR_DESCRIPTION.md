# Experiment Live Full Brunch Integration — unpublished description draft

## 🌟 What is the purpose of this PR?

Preserve Live's fluid, full-duplex interview while Brunch directs the conversation
and performs authorized application work. The intended path is finalized speech
through the existing composer and Flue admission, Brunch reasoning/execution,
complete-turn settlement, a frozen canonical speech source, and Live delivery.

**Authority cut only:** this branch currently records the accepted mission and
manual test plan, not an integrated application. The selected experiment uses
separate authoritative transcription and native Live with best-effort speech control.
It does not claim strict audible-output control or exact relay.
Kostandin's positive standalone impression supports exploring integration; it is
not comprehensive acceptance. No live end-to-end, naturalness or readiness claim.

The owner conversation accepts this hybrid, experimental speech-policy relaxation,
mission recut and one separate local mission-only commit. Product commits and
publication remain unauthorized.

## 🔗 Related links

- [FE-1664](https://linear.app/hash/issue/FE-1664/experiment-live-full-brunch-integration) _(internal)_
- Parent [FE-1663 / #9671](https://github.com/hashintel/hash/pull/9671)
- Retained assessment [FE-1661](https://linear.app/hash/issue/FE-1661/evaluate-gpt-live-1-migration-effort-before-the-demo) _(internal)_
- [Mission contract and inspected sources](libs/@hashintel/brunch-agent/MISSION.md)

## 🚫 Blocked by

- [ ] Implement and verify the first short Brunch exchange under the accepted policy.
      Independent questions and unsupported claims are manual failure observations,
      not canonical answers or accepted production behavior.
- [ ] Before claiming compatibility with current main, coordinate inclusion of
      #9649's host/construction changes. The child-only restack is complete; neither
      this child nor its parent includes that main delta.
- [ ] Merge dependency only: parent #9671 remains unmerged; eventual child PR targets
      its branch, not main. This does not block starting authorized child development.

## 🔍 What does this change?

Records the accepted authority and evidence needed to cross one real no-tool
exchange. The website mission points to the sole Brunch authority; the consumed
draft is removed. Product code and the parent are untouched. No adapter, transcript
finalizer, playback lifecycle or queue is invented.

<details>
<summary>🏗️ Agent notes</summary>

This is a projection of the [mission](libs/@hashintel/brunch-agent/MISSION.md),
not another authority. Its six semantic addresses are:

- **Imperative:** the person feels heard, can hesitate/correct/elaborate, and the
  interview advances without repetitive notices, monologues or fabricated progress.
- **Throughline:** existing consent/WebRTC → approved finalized-input mechanism →
  composer → one Flue admission → Brunch/Petrinaut → whole-turn settlement → frozen
  canonical prose → Live commentary. Native audio remains unbuffered and best-effort;
  settlement gates context, not all speech. First a short no-tool turn, then authorized work.
- **Proof:** mocked boundary checks plus Kostandin's manual canonical/effects/audio
  comparison; typed/Voice/stopped-entry second-tab recovery before readiness. The
  current documentation-only result proves neither the tracer nor migration readiness.
- **Constraints:** Brunch domain meaning, Flue identity/order/settlement, Petrinaut
  execution/effects; preserve #9562, existing queue, Realtime behavior, consent and
  cleanup. No provider calls, synthetic audio, prompts/model changes or publication.
- **Fog-line:** use a separate transcription session's completed-item events because
  native Live has no final-transcript event. Verify ordering and dual-session cleanup.
  Live has no response-terminal lifecycle; do not use commentary acknowledgement as
  playback proof. The manual witness must assess speech adherence and fluidity.
- **Stop or reorient:** after the authority-only commit, cross the first no-tool turn.
  Premature speech, lost corrections, invented status,
  uncertain replay or revived stopped speech require reassessment, not demo workarounds.

Proposed input: OpenAI `gpt-live-transcribe` over browser WebRTC, using one consented
microphone capture for Live and transcription. The documented
`conversation.item.input_audio_transcription.completed` event finalizes each item;
completions can arrive out of order. Preserve stable identity and provider item order
before using the existing composer and its one-waiting-input policy. No new FIFO,
Live-transcript fallback, automatic replay, or audio approval buffer. Exact creation
schema and ordered-event reconciliation still require implementation verification.

Stack: branch `kostandin/fe-1664-experiment-live-full-brunch-integration` at
`/Users/kostandin/Projects/hashdev/worktrees/fe-1664-live-brunch-integration`, based on
published parent [b72c2ac9f83875d34f585bc672ef62496144fe6a](https://github.com/hashintel/hash/commit/b72c2ac9f83875d34f585bc672ef62496144fe6a).
Eventual base is `kostandin/fe-1663-experiment-live-full-duplex-migration` while #9671
is open. The original main baseline [67f60d5446](https://github.com/hashintel/hash/commit/67f60d5446ed3224609161f938e1b36bc9d62f89)
is already an ancestor. The restack includes the parent's activity indicators,
standalone prompt changes, microphone-loss shutdown and bounded/cancellable uploads. Main
[35587f9dd2](https://github.com/hashintel/hash/commit/35587f9dd2a795d44aac1938aff74e0acab4d994)
adds #9649's host/construction changes, which remain outside this child and parent.
Coordinate that future stack update rather than modifying the parent. The exact
manual-test revision was not supplied. The original standalone comparison remains
[771712c1af](https://github.com/hashintel/hash/commit/771712c1afe2d4f3d3e5ee8fac39d17303bee7a1).

Donor disposition: retain source identity, factual fidelity, full reports on screen,
event-grounded notices, settlement and recovery obligations. Do not import Realtime
response-terminal machinery as Live events, #9638's FIFO/Resume/Discard policy,
the prompt changes from #9585, #9651's synthetic harness or #9622's negative speech authoring.
No mechanism has been replaced in code. The [mission's donor table](libs/@hashintel/brunch-agent/MISSION.md#carry-over-classification)
pins rechecked heads and distinguishes contracts from mechanisms and policies.

</details>

## Pre-Merge Checklist 🚀

### 🚢 Has this modified a publishable library?

- [x] Does not modify any publishable blocks or libraries, or modifications do not need publishing.

### 📜 Does this require a change to the docs?

- [x] Requires changes to planning docs which are made as part of this draft.

### 🕸️ Does this require a change to the Turbo Graph?

- [x] Does not affect the execution graph.

## ⚠️ Known issues

`live` still selects the inherited standalone experiment. It is **not integrated
Live**, and must not be presented as such. Realtime remains the existing integrated
baseline; it can speak completed segments before whole-turn settlement, so do not
mislabel it as the proposed Live settlement gate. Direct spoken-user provenance
after hydration and durable locally withheld work recovery remain unproved.

## 🐾 Next steps

The separate local authority commit is restacked on the published parent. Implement
the first no-tool exchange. The [selected experiment](libs/@hashintel/brunch-agent/MISSION.md#selected-experiment)
is accepted; do not reopen native best-effort versus buffering as an implementation
prerequisite. No product commit, push or PR publication is authorized by this file.

## 🛡 What tests cover this?

Documentation-only verification checks local links/anchors, referenced test paths,
single mission authority, ancestry, whitespace and unchanged product/archive
files. Unit tests, typechecking, lint and UI rendering have **not** been run for an
integrated implementation: none exists yet. The [regression portfolio](libs/@hashintel/brunch-agent/MISSION.md#provider-free-regression-portfolio)
names the existing suites and discriminating cases for the approved implementation.

## ❓ How to test this?

No provider session was started. These commands are for Kostandin's manual use,
from the child root after ordinary dependency/environment provisioning. Use the
existing Brunch credentials and `OPENAI_VOICE_API_KEY`; no new service is required
by this preparation. Open `http://localhost:4915`; the paired Brunch server uses
4321 and the launcher supplies `/agents/chat`. Do not start Voice until ready to
consent to microphone/provider access.

```sh
# Existing integrated Realtime; unset provider also selects realtime.
PETRINAUT_OPENAI_VOICE_ENABLED=true PETRINAUT_VOICE_PROVIDER=realtime yarn dev:brunch

# Currently standalone Ex1 ONLY, not integrated Ex2.
PETRINAUT_OPENAI_VOICE_ENABLED=true PETRINAUT_VOICE_PROVIDER=live yarn dev:brunch
```

Run one provider configuration at a time; restart for the other, never switch an
active session. The fresh child has not had dependencies or credentials provisioned.

Once an approved integrated path exists, allow about 15–20 minutes:

1. Give an account and answer a short Brunch clarification.
2. Hesitate, elaborate and correct a consequential detail.
3. Add a follow-up while Brunch performs one authorized operation.
4. Interrupt audio, then separately exercise durable Stop and AI/Workpiece switching.
5. Compare canonical history, actual workpiece/tool outcomes and audible responses.
   Record backend work, queue wait and provider/playback delay separately; notices
   are not substantive answers. Before readiness, also run the mission's second-tab
   typed/Voice/stopped-entry and withheld-work recovery witness.

## 📹 Demo

None: no integrated UI or live session was demonstrated. Retain the original
standalone comparison; do not use it as evidence of Brunch integration.
