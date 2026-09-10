# FE-1653: Ground Brunch in the current Petrinaut net

## Status

Live on the Graphite-tracked child branch of PR #9619. Voice behavior is unchanged by this
mission. The 2026-09-10 review remediation is approved against baseline
`b034530340`: replace delivery-payload inference with per-user-turn tool-call state, narrow
grounding claims to the capability this route can establish, and remove the duplicate
implementation plan.

## Imperative

Make an ordinary mounted Brunch conversation able to read the current open Petrinaut net on
demand, and instruct it to do so before answering a request about that net, while keeping every
mutation tool unavailable outside its existing validated-construction and prepared-fixture modes.

## Throughline

```text
ordinary Flue conversation
→ getLatestNetDefinition available to each ordinary user turn
→ user delivery resets one persistent current-turn read state
→ invoking getLatestNetDefinition atomically marks that turn as requested
→ later renders keep the reader unavailable until the next user delivery
→ existing client-tool-result continuation
→ shared browser classification
→ live transport and hydrated history projection
```

## Proof

- `apps/brunch-agent/test/petrinaut-chat.test.ts` proves the ordinary server exposes
  `getLatestNetDefinition` and no construction mutation.
- The faux-provider request inspection proves the grounding instruction and canonical read tool
  definition reach the model request.
- `local-storage-demo-app.test.tsx` proves the ordinary browser catalog is exactly the docs reader
  and current-net reader.
- `use-flue-chat-history.test.ts` proves a correlated current-net result hydrates as an
  `output-available` tool part.
- Plugin tests prove an unrelated client-tool continuation cannot remount the reader after it was
  invoked and that a later user delivery makes it available again.
- The focused commands in the task brief are the acceptance oracle. They prove this read-only
  capability and its one-request-per-user-turn gate, not provider compliance, automatic
  construction, Voice latency, or provenance.

## Constraints

- Use the existing mounted Flue route and `client-tool-result` signal.
- Use the canonical `petrinautConstructionTools` definitions and
  `getLatestNetDefinitionToolName`.
- Make the current-net read available to every ordinary user turn; ordinary conversations receive
  no mutation.
- Track whether the current turn requested the read at the tool-call boundary. Do not infer this
  policy from serialized `client-tool-result` payloads.
- Preserve validated construction and prepared-fixture tool gates.
- Keep the shared browser catalog authoritative for both live transport and hydration.
- Describe grounding as an on-demand capability plus model instruction. A hard pre-answer
  guarantee is not established by a model-selected browser tool.
- Do not add a second route, snapshot cache, automatic construction, or Voice/OpenAI canvas
  context. PR #9619 is the stack parent; do not change Voice behavior here.

## Fog-line

This task does not decide how a future host-enforced pre-answer snapshot protocol, automatic
construction, provenance, or direct Voice/OpenAI canvas context will work. A hard grounding
guarantee re-enters only when a later mission owns the browser-to-Flue context boundary.

## Stop or reorient

Stop if the ordinary path can invoke `addArc` or another mutation, if the browser and history
catalogs diverge, if the read bypasses `client-tool-result`, or if implementation requires a new
conversation route, raw continuation-payload parsing in the plugin, or a Voice change.

## Expected touched paths

`apps/brunch-agent/test/petrinaut-chat.test.ts`,
`apps/brunch-agent/test/petrinaut-chat.integration.ts`,
`libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts`,
`libs/@hashintel/brunch-agent/packages/plugin-sdcpn/test/construction-tools.test.ts`,
`.changeset/fresh-net-grounding-docs.md`, and
`libs/@hashintel/petrinaut/docs/ai-assistant.md`.

## Deferred

Automatic construction, provenance, and a host-enforced pre-answer snapshot remain future work.
Paid-provider output, browser behavior, and audible Voice behavior remain skipped witness
boundaries; this mission does not claim them.
