# Mission 4 to Voice integration handoff

Date: 2026-09-03

Status: **branch-close reconciliation; no Voice branch was merged or modified.**

## Compared heads

After `gt sync && gt restack`, Mission 4's current-ancestry implementation/evidence head is `1d3beb7644f987e0a8c895c5f2c2514ca3e429a3`; it is patch-equivalent to the historical paid-run head `e42a53bcf9f97702d1e1cc6cf3fc59ecd60a6369`. It was compared with the current remote Voice stack before closure-only documentation was added:

| Surface | Head / PR | Observed purpose |
| --- | --- | --- |
| Mission 4 | `1d3beb7644f987e0a8c895c5f2c2514ca3e429a3` on `ln/fe-1563-redesign-runbook-workpiece` | Package-composed Brunch core capability and SDCPN job skill, production Flue evidence, persona harness |
| Spoken-response optimization | `c7fe8a2e68e8fdc37018b21ec2e9daf4e9ef7c82`, PR [#9496](https://github.com/hashintel/hash/pull/9496) | Voice-optimized Brunch response lifecycle |
| Temporary Brunch ask shim | `252b9dbb0c77fae8cee45a506f09cac3e20c381c`, PR [#9507](https://github.com/hashintel/hash/pull/9507) | Dynamic client ask and correlated answer history |
| Voice turn-taking and provenance | `a7b1115228df64f3592037cf2cd316a551d348fe`, PR [#9512](https://github.com/hashintel/hash/pull/9512) | Voice dock, interruption/cancellation, finalized-answer provenance, canonical transcript behavior |

The latest Voice head descends through the temporary ask stack but not through this Mission 4 branch. After Graphite synchronization their common base remains `807fc0481ae3eed147f911d5d4a49ef9031a8afe`, before Mission 4's current app/package restructuring. Mission 4's parent is now `ln/fe-1525-headless-runbook-pn` at `d8c17c37fae80c57d3b22b748a94ab39e96e18ee`; the Voice stack begins from a separate PR based on `main`. Neither stack currently includes the other.

## Integration rule

Port Voice behavior onto Mission 4's current ownership and file topology; do not resolve conflicts by restoring the Voice branch's older app-local Brunch stub.

| Voice-stack edit location | Current Mission 4 authority | Reconciliation |
| --- | --- | --- |
| `apps/brunch-agent/src/agents/chat-agent.ts` | `apps/brunch-agent/src/agents/chat-agent/agent.ts`, `@hashintel/brunch-agent/flue`, and `@hashintel/brunch-agent-plugin-sdcpn/flue` | Preserve `useBrunchAgent()` and `useSdcpnPlugin()`. Mount only the Voice-required client tool and narrowly scoped host instruction in the current composer. Do not restore `confirm-path` or the concise stub prompt. |
| `apps/brunch-agent/src/tools/brunch-ask.ts` | Core ask name/input/output contracts in `packages/core/src/client-tools.ts`; executable host tool remains an app/production-composition decision | Re-evaluate the temporary shim against the current suspended structured-question policy. If retained for Voice, keep it visibly temporary and mount it without changing universal elicitation policy. |
| `apps/brunch-agent/src/client-tool.ts` | `apps/brunch-agent/src/conversation/client-tools.ts` | Add any accepted ask tool to the current client-tool registry and preserve exact suspension/result correlation. Keep `readPetrinautDoc` behavior unchanged. |
| `apps/brunch-agent/src/flue-transcript.ts` | `apps/brunch-agent/src/conversation/transcript.ts` | Port finalized Voice-answer provenance and dynamic ask history to the relocated transcript projection; canonical Flue history remains authoritative. |
| `apps/brunch-agent/src/flue-ui-stream.ts` | `apps/brunch-agent/src/conversation/ui-stream.ts` | Port only current streaming/provenance behavior through the relocated module. |
| Voice changes in Petrinaut `ai-assistant-panel.tsx` and its private subtree | Same Petrinaut panel/public contracts, largely unchanged by Mission 4 | Preserve Voice's `submitText`, interruption, playback, and provenance contracts; adapt host tool names/types to the current Brunch package exports rather than duplicating them. |

## Compatible decisions

The branches agree on several useful invariants:

- Brunch chooses the interview question and canonical response text.
- Voice may prepare or speak that text but does not become the elicitation decision-maker.
- Finalized answers enter canonical conversation history; provisional audio/transcription remains ephemeral.
- Client-tool answers are correlated to the exact pending tool call and resume the existing Flue turn.
- Canonical history, not a secondary Voice transcript, is the durable evidence source.
- Host/browser code executes interactive UI behavior; core owns reusable question/answer semantics when that capability is promoted beyond a temporary preview shim.

## Decisions that remain open at integration

1. Whether the temporary `brunch_ask` shim is still needed after current structured-question policy is re-evaluated, or Voice should initially remain text-turn-only.
2. Whether Voice integrates by making its stack a new parent for this closed branch, by porting Mission 4 commits onto the Voice stack, or by a fresh reconciliation branch. This document selects no Git operation.
3. How the Voice stack's conversation identity maps onto current principal + conversation id derivation and per-net continuity.
4. Whether the current S4 report-versus-immediate-ask policy matters to Voice. It remains deferred; Voice must not silently make it acceptance-critical.
5. Which current documentation screenshots or user-guide passages need refresh after the final merged UI is observable.

## Verification floor for a reconciliation branch

- The built app still mounts the independent `elicitation` and `sdcpn-modelling` skills through the current core/plugin composition.
- One typed Brunch interview and one Voice interview share canonical Flue history without duplicated or inferred answers.
- One dynamic ask, if retained, renders in the panel, accepts exactly one finalized typed or spoken answer, records its provenance, and resumes the originating tool call.
- Voice cancellation and **Your turn** cannot submit playback or pre-handoff microphone audio as an answer.
- Stock assistant mode remains functional and independent.
- Existing Mission 4 package, topology, transcript, transport, and persona-harness tests plus the Voice stack's panel/turn-taking/provenance tests pass after conflict resolution.
