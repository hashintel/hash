# FE-1630 — Optimize and measure the Brunch Voice relay

## Status

**Live.** Kostandin authorized this bounded experiment and, on 2026-09-08, explicitly approved the outlined version-pinned Flue dependency-patch exception: “do now - but note it”. This is a maintained local extension to Flue 2.0.3, not upstream-supported functionality. The exception is limited to delivery-scoped response-style context and its reliable recovery; it does not authorize a provenance or persistence redesign.

Implementation, local before/after evidence, and an audible demonstration are available in [the evidence packet](docs/evidence/implementations/improved-voice-relay/verification.md). Bounded long-report delivery works in the recorded run; concise clarification does not. The recommendation is to reconsider #9571, not declare this relay adequate. #9564 has merged and main has been integrated without changing the experiment's product files. Human acceptance and full preview verification remain outstanding; this mission is not accepted.

[FE-1630](https://linear.app/hash/issue/FE-1630/optimize-and-measure-the-brunch-voice-relay) _(internal)_ / `kostandin/fe-1630-improved-voice-relay` / [draft #9585](https://github.com/hashintel/hash/pull/9585). Foundation: [#9564](https://github.com/hashintel/hash/pull/9564), pinned at [bfd99d38fe53baa2ec15045dadf585f4c7890ffc](https://github.com/hashintel/hash/commit/bfd99d38fe53baa2ec15045dadf585f4c7890ffc). Its accepted authority is preserved verbatim in [the Mission 6b archive](docs/mission-archive/6b-voice-resumable-reconciliation.md); its limitations and Deferred items remain inherited, not silently closed. No future draft is consumed by this separate experiment.

## Imperative

Determine whether Voice-mode Brunch prompting and bounded Realtime delivery make the existing relay sufficiently natural, without transferring domain authority. Deliver implementation, comparable before/after findings, and a short demonstration video. The visible advance is concise spoken clarification and a complete on-screen report that is read only on request.

## Throughline

Existing panel Voice input → shared AI SDK transport → one Flue user admission with unchanged text and optional `context.responseMode: "voice"` → Brunch's fixed effective-system-context instruction → canonical visible response → bounded Realtime speech. Typed messages omit context. Browser-tool continuations carry the originating response preference through their existing result admission; no global mode or additional signal admission.

### Ordered implementation and verification

1. **Dependency contract first.** Add failing real-runtime tests under `apps/brunch-agent/test/` for delivery context, idempotent retries/conflicts, input recovery, and absence from model/user text. Patch the exact published runtime/SDK 2.0.3 packages using Yarn; persist opaque JSON context in existing submission and private canonical records, restore it through `useDelivery`, and leave public history/model projection unchanged. Keep the patch isolated in its own commit and document removal on adoption of an upstream equivalent.
2. **Brunch wiring.** Extend `packages/transport-aisdk/src/index.ts` to derive the preference from existing live message/tool-result Voice metadata. Add tests in `test/chat-transport.test.ts`. Add fixed Voice instructions in the app's `ChatAgent` and test effective prompt inclusion/exclusion with the real runtime. No browser-supplied arbitrary instruction text.
3. **Bounded delivery.** Test and change website `voice-interview/{realtime-brunch-bridge,openai-realtime-session,voice-turn-controller}` and `server/voice/openai-voice-policy`. Only application-selected fixed non-substantive bridging/offer text may be spoken outside canonical Brunch text. Keep diagnostics distinguishable, exact replay, and `semantic_vad.create_response: false`. Hold automatic delivery until response length can be classified; long reports remain complete on screen with an offer to read.
4. **Combined proof.** Run targeted unit/runtime tests, affected TypeScript/lint checks, formatting, and `git diff --check`. Repeat the recorded short/long local inputs without changing their substance. Inspect rendered results, capture the demonstration, and report uncertainty rather than manufacture a naturalness verdict.

## Proof

- **Baseline oracle:** [recorded synthetic-speech baseline](docs/evidence/implementations/improved-voice-relay/baseline-2026-09-08.json) and [method/findings](docs/evidence/implementations/improved-voice-relay/verification.md). The real local providers returned a 192-word clarification and automatically delivered a 1,178-word report; Realtime also inserted an unsolicited preamble. This establishes neither human naturalness nor first-audible latency.
- **Context oracle:** real Flue admission/runtime tests must distinguish Voice, typed, and causally linked tool continuations; unchanged retries deduplicate, changed context conflicts, and recovered input retains context without leaking it into public/model text. Existing no-context inputs remain valid. No new SQL store or sidecar is permitted.
- **Speech oracle:** bridge/session/controller tests prove short output delivery, long-report withholding, exact requested reading, fixed bounded bridging without tools, interruption versus durable Stop, and no autoplay/duplicate content on reopen. Inspect corresponding browser states rather than count passing tests as audible proof.
- **Product oracle:** comparable local before/after observations and an inspected demonstration video. Human-audible evidence is required for a naturalness judgment. Explicitly document latency, repetition, long-report, and interruption limitations. A synthetic run is labelled as such.
- **Repository oracle:** affected `test:unit`, `lint:tsc`, `lint:eslint`, changed-file Oxfmt, and `git diff --check`; record failed or unavailable checks honestly. Preview testing remains gated on #9564 merging. No paid evaluation campaign is authorized.

## Constraints

- Brunch owns domain meaning, questions, conclusions, workpiece state, and tools. Realtime has no domain tools or authority. Bridging never interprets evidence, confirms changes, asks domain follow-ups, or alters qualifications.
- Voice instructions ask for concise conversational answers, necessary conclusion/question first, no unnecessary preambles/repetition, consequential qualifications preserved, and complete detailed canonical reports on screen. Typed effective instructions remain unchanged.
- Context is a response-style preference, not verified Voice provenance, identity, permission, or tool authority. It is snapshotted with each admitted delivery, not mutable conversation state. Direct-user Voice attribution on hydration remains outside this experiment.
- Preserve admission/correlation, existing tool-order fixes, interruption/Stop distinctions, canonical text, exact reading, and shared conversation routing. Do not reimplement the parent's tool-order fix.
- Do not change CORS/donor/ownership worktrees, FE-1624, or #9571. No delegation/`clarify_by_voice`, client-tool handback, sidecar conversation storage, persistence-only extension, workpiece redesign, or unrelated Linear write.

## Fog-line

The delivery context patch must carry joined-input recovery as well as initial submission JSON; public history is not a new provenance API. If this demands broader persistence architecture, stop and return to the owner. Prompt constraints cannot guarantee Realtime will emit only allowed strings: the baseline violated verbatim-only instructions, so compare provider output with requested text and retain violations in evidence. Response-length threshold and speech naturalness are experimental choices, not architectural acceptance.

## Stop or reorient

Stop if context leaks into user/model text, retries gain another admission, recovery loses the preference, typed behavior inherits Voice mode, or the patch needs another store/authority. Reorient on observed delivery failures rather than expanding tools or ownership. If #9564 moves, restack/re-pin and rerun affected evidence before review; no parent/sibling rewrite. Neither baseline verbosity nor missing context alone selects #9571.

## Deferred

[The future spine](MISSION.next.md) and the archived Mission 6b Deferred section retain all prior owners, gates, and limitations. Split ownership and local domain follow-ups remain future design in [#9571](https://github.com/hashintel/hash/pull/9571), untouched. Final recommendation must be evidence-led: adequate optimized relay → defer #9571; persistent local-follow-up round-trip failure → reconsider #9571, without implementing it here.
