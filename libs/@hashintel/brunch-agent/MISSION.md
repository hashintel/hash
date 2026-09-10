# Separate Brunch-authored Voice speech and display

## Status

**Live; scope and implementation authorized by the owner.** This is the sole mission on local
`voice/separate-brunch-speech`, stacked on [#9585](https://github.com/hashintel/hash/pull/9585)
at [0902dddb](https://github.com/hashintel/hash/commit/0902dddbbfd53ac98499c44a7302339bca135563).
Authority was committed separately before product changes. The owner has authorized committing,
pushing, and opening this follow-up as a draft stacked PR. Issue creation, paid provider activity,
manual deployment changes, and mission acceptance remain unauthorized.

The accepted scope and timing decision are in the
[owner conversation](https://ampcode.com/threads/T-01a085b2-4d2a-73ca-bf56-95ec31430d52).
The prior planning conversation contains the pasted meeting transcript; the Notion proposal and
Slack discussion remain unreviewed. The inherited CORS contract is preserved without adjudicating
its acceptance in [its historical record](docs/mission-archive/sre-1042-browser-origin-policy.md).
No provisional future draft is consumed.

## Imperative

Determine whether Brunch can give a useful brief spoken answer or takeaway alongside complete
on-screen content while retaining domain authority. Judge usefulness, fidelity, and delay
separately. This tests separate Brunch-authored outputs under whole-correlated-reply completion
gating, not the best possible latency of a relay.

Visible advance: a Voice clarification gives a useful answer rather than only a reading notice;
a long analysis gives a substantive takeaway while preserving the full report on screen.
Demo: open the prepared crew-reservation fixture, ask the two comparison inputs below, inspect
the spoken content and report, request full reading, repeat a marked question, interrupt, Stop,
and reopen. The local panel is the initial proof boundary; no deployed claim follows from it.

## Throughline

Existing Voice admission and delivery-scoped context → Brunch tools and browser continuations →
Brunch-authored spoken and displayed outputs → completion of the whole correlated reply →
application-selected verbatim Realtime playback.

- Short answers give a brief useful answer. Ask a follow-up only when it materially advances the
  modelling goal; clarify first when ambiguity would materially change the answer.
- Long analyses have a substantive spoken takeaway and complete visible report/workpiece.
- Speech remains inspectable and associated with its originating response after reload. Authored
  speech is not proof that it was heard. Read full response selects the complete displayed text.
- Direct questions retain the existing exact marker tool, exact visible prose, and accessible
  replay; a spoken question preserves that wording.
- Automatic speech waits for the whole correlated reply, including browser-tool continuations.
  An earlier completed message/submission does not suffice. The gate does not wait for the next
  user answer. Failed/aborted replies do not release pending automatic speech.
- Missing, invalid, or uncorrelated speech never triggers an invented summary or automatic full
  report reading. A delivery notice is not successful substantive delivery.

### Ownership and permitted changes

App-owned ChatAgent Voice instructions own output separation. Core SYSTEM.md, its question
semantics, and SDCPN prompts/skills remain unchanged, including full recoverable-workpiece and
prepared-fixture obligations. Realtime remains a delivery-only renderer with no domain tools,
independent questions, conclusions, or summaries. Typed effective instructions remain unchanged.

The owner approved a bounded app-only wording experiment after live diagnosis found speech
authoring omitted despite the overlay and tool being present: explicitly order evidence gathering
→ speech authoring → optional question marking → visible delivery, including clarification-only
replies. This experiment authorizes no mechanism change or additional provider calls.

Existing structured data writers/transport are a candidate, not a preselected schema. First pin
live completion, persisted history, response identity, continuation folding, and replay. Use the
existing conversation route/store. Stop if a new store or broader runtime redesign is required.

Expected owners: ChatAgent and its tests; core's shared data contract if required without changing
universal prompts; AI SDK streaming/history/correlation; website Voice selection, bridge,
controller, session/policy, and minimal response-associated inspection UI. Update relevant user
documentation if exposed behavior requires it. No unrelated prompt or infrastructure cleanup.

## Proof

1. **Context isolation:** real-runtime effective prompt tests in
   `apps/brunch-agent/test/voice-context.test.ts` and transport admissions distinguish
   typed → Voice → browser continuation → typed. Typed instructions and tool availability remain
   unchanged. Unknown preferences do not enable Voice behavior.
2. **Routing and durability:** targeted transport `ui-stream.test.ts`, `transcript.test.ts`, and
   `chat-transport.test.ts`, plus website `canonical-speech.test.ts`,
   `realtime-brunch-bridge.test.ts`, `voice-turn-controller.test.ts`,
   `openai-realtime-session.test.ts`, and browser-tool integration tests. Exercise speech data
   before report completion, earlier completions followed by continuations, identical text on
   distinct replies, failed/aborted continuations, missing/invalid speech, full-report selection,
   exact question replay, interruption versus durable Stop, and reload without autoplay,
   duplicate admission, or duplicate content. Test actual outputs, not only absence of crashes.
3. **Content quality:** human inspection of audible speech against the request, full report,
   fixture and tool evidence. A simple clarification must be useful without gratuitous follow-up;
   a consequential gap must ask a relevant marked question; a long takeaway must not contradict
   the report or omit qualifications that change its meaning. A browser-tool continuation must
   report success, rejection, and no-op truthfully. Deterministic checks cannot accept this leaf.
4. **Comparable demonstration:** repeat “What does reserving a dispatch crew mean here?” and
   “Give me a detailed analysis of this model, including assumptions, possible bottlenecks,
   missing constraints, and what still needs validation. Do not change the model.” Use
   `crew-reservation-v1` and record model/configuration differences from #9585. Inspect a
   synchronized audible browser recording plus representative UI/accessibility states.
   Paid execution is blocked until an explicit bounded owner authorization; no campaign.
5. **Latency:** record end of user speech, completed transcription, whole-reply completion,
   speech request, and first substantive audible answer separately. Synchronized audio/human
   inspection is the first-audible oracle; provider buffer events and notices are not answers.
   Report no answer when none is heard. No invented word or latency acceptance threshold.
6. **Repository:** affected workspace `test:unit`, `lint:tsc`, `lint:eslint`, `build`, changed-file
   Oxfmt and `git diff --check`. Render and inspect the affected UI. Report blocked/failed checks
   honestly. Local and mocked checks do not establish deployed end-to-end behavior.

The #9585 evidence records 192 → 151 clarification words and only a notice spoken afterward;
the long report stayed complete and opt-in reading worked in the recorded run. These were
individual synthetic-input real-provider diagnostics, not a statistical campaign or human
acceptance. They do not prove core caused verbosity or exhaust relay prompt alternatives.

## Constraints

- Brunch owns domain meaning, questions, conclusions, tools, and workpiece state.
- Preserve tool-result truthfulness, submission correlation, direct-question semantics,
  interruption versus durable Stop, and reload without autoplay/duplication.
- Preserve typed effective instructions and behavior; no conversation-wide Voice switch.
- No Realtime reasoning/delegation, Brunch-as-client-tool, broad core redesign, new conversation
  store, workpiece/provenance redesign, unrelated infrastructure work, or paid campaign.
- The inherited #9585 delivery-context patch remains a maintained local Flue 2.0.3 exception,
  not an upstream-supported API; do not broaden that exception silently.
- No external writes, push, PR/issue creation, paid demonstration, or deployment without approval.

## Fog-line

The existing structured data writer is now selected for the local implementation: runtime
restart, transport, real-panel continuation, and replay checks establish the tested routing
contract. [Local verification](docs/evidence/implementations/separate-voice-speech/verification.md)
records the evidence and its limits; no real-provider or deployed acceptance follows.
Model adherence, useful brevity, speech/report consistency, actual audio fidelity, and tolerable
delay remain experimental. Completion gating avoids speculative delivery, not semantic errors.
Historical preview configuration and backend-deployment verification remain unresolved; any
remote claim requires a new real deployed witness. Human acceptance and paid ceilings are
owner-held. No separate Linear issue is linked, and no Linear integration is available in this
orb. Draft publication uses the repository's descriptive-title contribution workflow; Linear
writes still require explicit approval.

## Stop or reorient

Stop if typed behavior inherits Voice, speech loses response identity, cancellation allows later
autoplay, replay duplicates content, workpieces are incomplete, or claims exceed tool evidence.
Reorient if outputs repeatedly contradict, substantive speech is absent, or the small routing
change requires broader mechanisms. Do not weaken the oracle or repair content in Realtime.

Verdicts update this relay variant only. Content success with unacceptable delay leaves earlier
delivery unresolved for a follow-up; it does not select another architecture. Prepare evidence
and stop for owner acceptance rather than declaring naturalness or mission closure.

## Deferred

[MISSION.next.md](MISSION.next.md) retains the existing future spine and inherited limitations.
Its CORS transition pointer preserves deployment, authentication, and rate-limit owners.
Earlier delivery re-enters only if measured delay is unacceptable despite content success;
its safety and benefit need a separate scope and audible oracle. Alternative architecture
selection remains owner-held, not an automatic consequence of any experimental failure.
