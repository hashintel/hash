## 🌟 What is the purpose of this PR?

Preserve Live's fluid, full-duplex interview while Brunch directs the conversation
and performs authorized application work. The intended path is finalized speech
through the existing composer and Flue admission, Brunch reasoning/execution,
complete-turn settlement, a frozen canonical speech source, and Live delivery.

**Draft integration; connection failure unresolved.** The application integrates finalized
transcription with the existing Brunch composer/admission path. Kostandin reports that
the experiment does not connect; the failing stage is not yet identified. The experiment uses
separate authoritative transcription and native Live with best-effort speech control.
It does not claim strict audible-output control or exact relay.
Kostandin's positive standalone impression supports exploring integration; it is
not comprehensive acceptance. No live end-to-end, naturalness or readiness claim.

The owner accepts this hybrid, experimental speech-policy relaxation and separate
authority commit, and authorizes publishing the integration as a draft stacked on
FE-1663. Neither experiment is ready to merge.

## 🔗 Related links

- [FE-1664](https://linear.app/hash/issue/FE-1664/experiment-live-full-brunch-integration) _(internal)_
- Parent [FE-1663 / #9671](https://github.com/hashintel/hash/pull/9671)
- Retained assessment [FE-1661](https://linear.app/hash/issue/FE-1661/evaluate-gpt-live-1-migration-effort-before-the-demo) _(internal)_
- [Mission contract and inspected sources](libs/@hashintel/brunch-agent/MISSION.md)

## 🚫 Blocked by

- [ ] Identify and fix the reported connection failure using the failed request
      status/response or displayed error. Route availability is not a successful handshake.
- [ ] Kostandin witnesses the first short no-tool Brunch exchange under the accepted policy.
      Independent questions and unsupported claims are manual failure observations,
      not canonical answers or accepted production behavior.
- [ ] Before claiming compatibility with current main, coordinate inclusion of
      #9649's host/construction changes. The child-only restack is complete; neither
      this child nor its parent includes that main delta.
- [ ] Merge dependency only: parent #9671 remains unmerged; eventual child PR targets
      its branch, not main. This does not block starting authorized child development.

## 🔍 What does this change?

Reuses the consent, provider selection and WebRTC surface, adding a transcription-only
connection sharing the consented capture. Final items enter the existing composer
once in provider-committed order. Correlated complete Brunch turns supply frozen prose
to Live commentary. Stop invalidates late input/output and closes both transports.
No second conversation store, domain agent, queue policy or playback lifecycle is added.
The parent source and published history remain untouched. The child contains the
authority commit separately from its implementation.

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
  implemented/mocked path prepares the tracer but proves neither live compatibility nor migration readiness.
- **Constraints:** Brunch domain meaning, Flue identity/order/settlement, Petrinaut
  execution/effects; preserve #9562, existing queue, Realtime behavior, consent and
  cleanup. No agent-started provider calls, synthetic audio, Brunch prompt/model
  changes, merge or deployment. Draft stack publication is authorized.
- **Fog-line:** use a separate transcription session's completed-item events because
  native Live has no final-transcript event. Verify ordering and dual-session cleanup.
  Live has no response-terminal lifecycle; do not use commentary acknowledgement as
  playback proof. The manual witness must assess speech adherence and fluidity.
- **Stop or reorient:** after the authority-only commit, cross the first no-tool turn.
  Premature speech, lost corrections, invented status,
  uncertain replay or revived stopped speech require reassessment, not demo workarounds.

Implemented input: OpenAI `gpt-live-transcribe` over browser WebRTC, using one consented
microphone capture for Live and transcription. The documented
`conversation.item.input_audio_transcription.completed` event finalizes each item;
completions can arrive out of order. Preserve stable identity and provider item order
before using the existing composer and its one-waiting-input policy. No new FIFO,
Live-transcript fallback, automatic replay, or audio approval buffer. The creation
schema and ordered-event reconciliation have provider-free checks, not a live witness.

Stack: branch `kostandin/fe-1664-experiment-live-full-brunch-integration` at
`/Users/kostandin/Projects/hashdev/worktrees/fe-1664-live-brunch-integration`, based on
published parent [b72c2ac9f83875d34f585bc672ef62496144fe6a](https://github.com/hashintel/hash/commit/b72c2ac9f83875d34f585bc672ef62496144fe6a).
PR base is `kostandin/fe-1663-experiment-live-full-duplex-migration` while #9671
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
Live replaces Realtime response-controlled audio with native unbuffered delivery;
authoritative transcription supplies the missing finalized-input lifecycle. There
are no pre-settlement progress appends and no playback-completion claim. The
[mission's donor table](libs/@hashintel/brunch-agent/MISSION.md#carry-over-classification)
pins rechecked heads and distinguishes contracts from mechanisms and policies.

</details>

## Pre-Merge Checklist 🚀

### 🚢 Has this modified a publishable library?

This PR:

- [x] does not modify any publishable blocks or libraries, or modifications do not need publishing

### 📜 Does this require a change to the docs?

The changes in this PR:

- [x] require changes to docs which **are made** as part of this PR

Updates the mission, consent disclosure and experiment manual-test instructions.

### 🕸️ Does this require a change to the Turbo Graph?

The changes in this PR:

- [x] do not affect the execution graph

## ⚠️ Known issues

**The current manual attempt does not connect.** Local inspection confirms that
the child servers run on 4915/4321, `/api/voice/config` reports Live available, and
both session routes load. No provider session was started by the agent to reproduce
the failure. Request status/response or the displayed error is still needed to
distinguish Live creation, transcription creation, permissions and WebRTC readiness.

`live` selects the child integration. Realtime remains the unchanged integrated
baseline; it can speak completed segments before whole-turn settlement, so do not
mislabel it as the Live context-supply gate. Native Live may speak before settlement,
paraphrase incorrectly or ask independent questions. None of that becomes canonical
Brunch output or evidence of execution. Direct spoken-user provenance after hydration,
durable locally withheld work recovery and multi-turn answering/continuation correlation
remain unproved in the integrated Live path.

The first tracer uses a conservative **500 UTF-8 byte** commentary bound beneath
the provider's 500-token limit. Longer frozen sources remain on screen with a notice;
there is no truncation, chunking or automatic replay. This can omit audible answers
that the provider could have fit; revisit from the first actual short-turn observation.

## 🐾 Next steps

Resolve the connection failure, then manually witness the first no-tool exchange
before extending the tool/correction trial. The [selected experiment](libs/@hashintel/brunch-agent/MISSION.md#selected-experiment)
is accepted; do not reopen native best-effort versus buffering as an implementation
prerequisite. Draft publication is not live acceptance or authorization to merge.

## 🛡 What tests cover this?

Provider-free results (test process trees denied outbound networking):

- Website `yarn test:unit`: **51 files / 554 tests passed**. Finalized item ordering,
  duplicates, stale/conflicting input, uncertain admission, provider pinning,
  no history autoplay, source correlation, settlement, failed/textless continuations
  and Stop are covered by mocked boundaries and existing regressions.
- Website `yarn test:integration`: **2 tests passed**, using the built real Brunch
  registration/proposal/continuation/Stop path with the existing faux provider.
- Brunch `yarn test:unit test/provider-admission.test.ts test/reconciliation.test.ts`:
  **45 passed**. Petrinaut mounted assistant/contents suites: **125 passed**.
- Website typecheck/lint/build and Brunch production build pass. Website lint retains
  one warning in the unchanged Realtime control; builds retain existing compiler
  and bundle-size warnings.
- Playwright exercised real consent UI and a mocked microphone rejection with
  zero session requests. Both screenshots were inspected. No microphone, provider
  inference or synthetic audio was used. Browser networking allowed loopback only.

This proves neither a real Live↔Brunch exchange nor naturalness, tool-turn fidelity,
second-tab recovery or migration readiness. The [regression portfolio](libs/@hashintel/brunch-agent/MISSION.md#provider-free-regression-portfolio)
retains those acceptance limits.

## ❓ How to test this?

No provider session was started by the agent. These commands are for Kostandin's manual use,
from the child root after ordinary dependency/environment provisioning. Use the
existing Brunch credentials and `OPENAI_VOICE_API_KEY`; no new service is required.
Open `http://localhost:4915`; the paired Brunch server uses
4321 and the launcher supplies `/agents/chat`. Do not start Voice until ready to
consent to microphone/provider access.

```sh
# Existing integrated Realtime; unset provider also selects realtime.
PETRINAUT_OPENAI_VOICE_ENABLED=true PETRINAUT_VOICE_PROVIDER=realtime yarn dev:brunch

# Integrated Live + authoritative transcription on this child branch.
PETRINAUT_OPENAI_VOICE_ENABLED=true PETRINAUT_VOICE_PROVIDER=live yarn dev:brunch
```

Run one provider configuration at a time; restart for the other, never switch an
active session. Dependencies and both application builds are prepared. The running
child reports credentials present, but their provider validity has not been tested
by the agent. The dependency build uses the
existing root command:

```sh
turbo run build --filter '@apps/brunch-agent^...' --filter '@apps/petrinaut-website^...'
```

Website example generation hit the inherited bundled-HIR `r.platform is not a
function` failure. Generated examples are present locally after running the existing
generator through `tsx` with `@hashintel/petrinaut-core/hir` resolved to its source;
no product workaround or generated file is committed. The Brunch panel launcher
loads Vite directly and does not rerun that standalone examples script. A fresh
checkout needs example generation or equivalent build-cache outputs before checks.

Start with step 1 (about 5 minutes); inspect that result before the later 15–20 minute trial:

1. Give an account and answer a short Brunch clarification.
2. Hesitate, elaborate and correct a consequential detail.
3. Add a follow-up while Brunch performs one authorized operation.
4. Interrupt audio, then separately exercise durable Stop and AI/Workpiece switching.
5. Compare canonical history, actual workpiece/tool outcomes and audible responses.
   Record backend work, queue wait and provider/playback delay separately; notices
   are not substantive answers. Before readiness, also run the mission's second-tab
   typed/Voice/stopped-entry and withheld-work recovery witness.

## 📹 Demo

Local-only inspected UI captures: `apps/brunch-agent/.data-wipe-me/fe-1664-ui/consent.png` and
`apps/brunch-agent/.data-wipe-me/fe-1664-ui/error.png`. They demonstrate disclosure and failure UI,
not a live interview. Retain the original standalone comparison; do not use it as
evidence of Brunch integration. Recommendation: keep the draft blocked on the
connection failure, then evaluate the explicitly accepted hybrid's first manual
exchange. Retain Realtime as the baseline; migration readiness remains inconclusive.
