# FE-1630 — Improved Relay prerequisite evidence

## Status

Blocked before prompt or delivery changes. This is not an implemented experiment, a naturalness verdict, or a replacement for the accepted Mission 6b authority. No new live mission has been cut while the required baseline and supported Voice-context path remain blocked.

- Issue: [FE-1630 — Optimize and measure the Brunch Voice relay](https://linear.app/hash/issue/FE-1630/optimize-and-measure-the-brunch-voice-relay) _(internal)_, created in FE / brunch-agent, Todo, assigned to Kostandin Angjellari.
- Branch: `kostandin/fe-1630-improved-voice-relay`.
- Dedicated worktree: `/Users/kostandin/Projects/hashdev/worktrees/fe-improved-voice-relay`. It already existed, clean, on a placeholder branch; only that branch was renamed. CORS, donor, and ownership worktrees were not modified.
- Foundation: [#9564](https://github.com/hashintel/hash/pull/9564), pinned at [bfd99d38fe53baa2ec15045dadf585f4c7890ffc](https://github.com/hashintel/hash/commit/bfd99d38fe53baa2ec15045dadf585f4c7890ffc).
- Related future design: [#9571](https://github.com/hashintel/hash/pull/9571), untouched. FE-1624 was not reused or changed.

## Requested experiment and preserved boundary

Determine whether Voice-mode prompting and bounded Realtime delivery make the existing relay sufficiently natural. Deliver implementation, comparable before/after observations, and a short demonstration video. Record one short clarification and one long analytical response before changing prompts, after verifying corrected API usage on the latest foundation. Do not reimplement or broaden the tool-order fix.

Brunch must receive a supported Voice-mode hint in effective system context, without changing canonical user text or inventing provenance. Voice answers should be conversational and concise, put necessary questions/conclusions first, avoid preambles/repetition, preserve consequential qualifications, and retain complete detailed reports on screen. Typed turns must remain unchanged.

Realtime must retain no domain tools or authority. Application-requested bridging may contain only short non-substantive phrases, never evidence interpretation, workpiece confirmations, domain follow-ups, qualification changes, or tool calls. Autonomous semantic-VAD responses must remain disabled. Long reports should be announced as available on screen, offered for reading, and read verbatim only on request. Diagnostics must distinguish bridging from canonical speech.

Preserve shared Voice → Flue → Brunch routing, canonical transcript/UI content, admission, correlation, interruption, durable Stop, tools, and reopen without autoplay or duplication. Split ownership, delegation/`clarify_by_voice`, client-tool handback, sidecar storage, persistence-only Flue extensions, and workpiece/provenance redesign remain out of scope.

## Observed prerequisites

### Foundation moved during setup

The worktree initially matched remote [704f961aea2109a2297efa877898a76bb6e29818](https://github.com/hashintel/hash/commit/704f961aea2109a2297efa877898a76bb6e29818). During setup, Lu's remote branch was restacked and gained the cancelled-response retention fix. Before making any tracked change, this empty child was moved to the new foundation above. `gh stack` is unavailable; no parent or sibling branch was rebased or pushed.

#9564 remained **OPEN**, with `mergedAt: null`, when checked on 2026-09-08. No preview deployment was tested. If the parent moves again, the final reviewable PR must be restacked and all affected evidence re-pinned; the old checks do not establish the new base.

### No supported per-turn Voice hint on canonical user deliveries

Both installed `@flue/sdk` and `@flue/runtime` are exactly 2.0.3. Their public `DeliveredMessage` contracts allow `kind: "user"`, `body`, and optional image attachments. Only `kind: "signal"` supports attributes. `send` admits a message, creation-only `initialData`, `uid`, and an idempotency key; it has no per-turn instruction/context option. `useDelivery()` exposes the message, not its idempotency key or HTTP request context. `useInitialData()` is immutable and cannot distinguish later typed and Voice turns in the same conversation.

Authoritative 2.0.3 source: release [bf86b8726f5ba189844185fdbeca0e194344ded1](https://github.com/withastro/flue/commit/bf86b8726f5ba189844185fdbeca0e194344ded1), pointing to source [ac610378741d879a9d12d3f927ff9634e0b4f7ae](https://github.com/withastro/flue/commit/ac610378741d879a9d12d3f927ff9634e0b4f7ae).

- [SDK send contract](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/sdk/src/public/send.ts).
- [Runtime delivery types](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/types.ts).
- [HTTP admission validation](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/runtime/schemas.ts).
- [Delivery hook](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/hooks/use-delivery.ts) and [instruction hook](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/hooks/use-instruction.ts).

Changing Voice users into signals, adding a separate admission, carrying mode in user text, or storing an application-side mode map would not establish the requested supported per-turn system-context contract. None was implemented. A supported substrate capability or explicit owner-approved change to the constraints is required before choosing that mechanism.

### Real local baseline blocked by provider authentication

The unmodified local app was built and started at `127.0.0.1:4321`; the real Petrinaut panel ran at `127.0.0.1:4915/?brunch-fixture=crew-reservation-v1`. Browser inspection reached the prepared net, AI panel, and Voice consent screen through the same-origin `/agents/chat` proxy. The initial history 404 for a fresh conversation was followed by fixture preparation.

The Brunch provider boundary failed during preparation:

```text
401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}
```

The configured Anthropic credential must be corrected locally. No credential is included in this record. A secondary operational warning reported the local OpenTelemetry collector unavailable at port 4317.

No successful short clarification or long report was produced. No after observation, audible latency measurement, interruption witness, or demonstration video exists. The absence of these records is a blocked prerequisite, not a failed naturalness trial. No paid evaluation campaign or preview test was run.

## Local verification

On the pinned new foundation, this targeted baseline command passed **4 files / 123 tests**:

```sh
yarn workspace @apps/petrinaut-website exec vitest run \
  src/main/app/voice-interview/realtime-brunch-bridge.test.ts \
  src/main/app/voice-interview/openai-realtime-session.test.ts \
  src/main/app/voice-interview/voice-turn-controller.test.ts \
  src/server/voice/openai-voice-policy.test.ts
```

These are existing deterministic relay/cancellation/policy tests, not proof of the proposed optimizations or real speech quality.

Setup needed a focused immutable install (`yarn workspaces focus hash @apps/brunch-agent @apps/petrinaut-website`) after the full install exhausted disk space. Only this run's partial `node_modules` was removed. The focused install passed with existing peer warnings. The initial transitive Turbo build failed at missing `redocly`; a direct backend-utils build reported missing generated graph/type-system dependencies. It emitted the telemetry dependency needed by Brunch, but that failed build is not claimed as passing. `yarn workspace @apps/brunch-agent build` then passed. Scoped Petrinaut, Petrinaut core, plugin, optimizer-client builds and website example generation made the local panel runnable. No unrelated generated source or toolchain-lock changes are retained.

Additional baseline checks passed:

- `yarn workspace @apps/petrinaut-website lint:tsc`.
- `yarn workspace @apps/petrinaut-website lint:eslint`: zero errors, one existing React set-state-in-effect warning at `voice-interview-control.tsx:627`.
- `yarn oxfmt --check` on `realtime-brunch-bridge.ts`, `openai-realtime-session.ts`, `voice-turn-controller.ts`, and `openai-voice-policy.ts`: all four matched files formatted correctly.

These checks must be rerun for the eventual implementation; no implementation exists to validate yet. This documentation packet is checked with `git diff --check`; Brunch Markdown is excluded from repository Oxfmt/Markdownlint policy.

## Remaining proof and decision

After fixing the credential and resolving the supported-context prerequisite, cut the bounded live mission separately before implementation. Capture the short and long baseline first, then implement within the requested envelope. Test typed isolation, concise Voice clarification, complete visible long report with opt-in exact reading, non-substantive bridging, interruption versus durable Stop, and no autoplay/duplicate canonical content on reopen. Retain comparable observations and a demonstration video, and document latency, repetition, long-response, and interruption limitations. Test preview only after #9564 merges.

Neither requested recommendation is supported yet: the optimized relay has not been exercised, and local-follow-up round-trip failure has not been observed by this experiment. Keep #9571 unchanged; authentication and missing context support are not evidence selecting split ownership.
