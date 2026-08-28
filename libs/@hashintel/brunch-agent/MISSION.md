# Mission 3 — runbook, template, headless PN

## Status

Live. This file is execution authority.

Later concerns are clustered in [`MISSION.next.md`](MISSION.next.md). That file is a draft of
upcoming work, not a mission; do not implement it. Host-trunk work, Petrinaut read/write tools,
typed IR maps, observer-triggered sweeps, and any join to Mission 2's capture store are not this
mission.

## Imperative

Prove that a comprehensive runbook and IR template can teach a model through the live Flue
chat door, that the filled template can be driven headless (no GUI), and that the filled
document contains enough to generate a Petri net Petrinaut will accept. Condition 5's runner
is broken on this app (deleted elicitor imports); restore the JS-API drive pattern, not a TUI
and not the old SDCPN elicitor. This is a prompting experiment. It does not improve capture
quality, and it does not fold Mission 2's ledger.

## Throughline

One headless pass on the Mission 1 door, with a runbook and IR template mounted on the
production `ChatAgent`:

`createFlueClient → send → wait → history() → filled IR template → structured (not strictly typed) IR → PN JSON → petrinaut-core parse/validate`

Generate the net without canvas mutation tools. Manual load into the app is enough to score
whether the template contained enough to draw. Template fill is not a sweep: sweep means
capture-store apply. Do not join this path to Mission 2's store.

## Proof

This proof establishes that a headless teaching loop can fill a template and yield a
validatable Petri net. It does not establish a typed map, canvas write tools, capture
improvement, session-as-net, or two brains.

From the real brunch-agent entrypoint (same `ChatAgent` / `/api/chat` door as Missions 1–2),
one production-path test or documented JS-API script observes all of the following:

1. A headless client drives the live agent with `createFlueClient` → `send` → `wait` →
   `history()` (the Flue routing-table loop, not a PTY/TUI).
2. A comprehensive runbook and IR template are mounted on that agent (system prompt, skill
   body, supporting file — placement is fog; bundling in the skill is allowed).
3. The conversation fills the template; the filled document is recoverable from that
   conversation's outputs without opening the Petrinaut GUI.
4. Inference from that filled document produces PN JSON that `parseSDCPNFile` (or the current
   petrinaut-core import equivalent) accepts. Missing canvas positions are allowed if the
   parser already treats them as recoverable.
5. The interviewer never called a sweep tool; the capture store was not written as part of
   producing the net.

Prefer that one throughline over a broad suite. A human panel run is not required; manual
load of the JSON into the app is enough to inspect the drawing.

## Constraints

- Mission 1's chat door stays the door: Petrinaut panel → `transport-aisdk` → Flue
  `ChatAgent`. Do not rewrite the panel onto `@flue/react`. The adapter still must not depend
  on core, binding, or plugins.
- Restore the drive pattern from condition 5's runner (`createFlueClient` over the app
  router). Do not revive that runner's SDCPN elicitor, `brunch_ask`, sweep, fold, or
  completion accounting as the teaching vehicle.
- Do not re-enter plugin-gherkin, plugin-sdcpn, repertoire, kinds, slots, fold, completion,
  issues, or correction in order to author the template.
- Template fill is not a sweep. Do not call `applyCaptureSweep` or otherwise join Mission 2's
  ledger unless a later cut says so. The template is a teaching artifact, not ADR-0003
  register-2 derived from captures.
- No Petrinaut canvas mutation tools. No typed FE map. Generation may be structured without
  being strictly typed.
- The app may import `@hashintel/petrinaut-core` to parse/validate PN JSON. It must not import
  `@hashintel/petrinaut` UI.
- Update runbook/docs only where exercised behavior changes.

## Fog-line

Do not design past these questions before running the simplest path that can answer them:

- Where the runbook and IR template live (system prompt, skill body, supporting file, or a
  bundle of those) so the model actually uses them under `send`/`wait`.
- What "structured but not strictly typed IR" looks like at the real boundary — a JSON
  document the script consumes, a skill output, or a last-turn artifact — without inventing a
  three-register revival.
- How much of condition 5's runner to restore versus a thinner drive script on the current
  `ChatAgent`.
- Whether `parseSDCPNFile` is enough "petrinaut validate," or the throughline exposes a
  smaller/larger import check.

Resolve each at the real boundary, record the observed answer in code/tests, and then
re-evaluate. Do not turn them into a plugin SDK revival or a capture↔IR join.

## Stop or reorient

Stop and surface the evidence before continuing if:

- producing the net requires writing Mission 2's capture store, or template fill is
  implemented as apply-sweep;
- plugin-sdcpn, repertoire, fold, completion, or `brunch_ask` re-enter as the teaching
  vehicle;
- canvas mutation tools appear on the interviewer;
- the drive becomes a TUI or a second server rather than `createFlueClient` against the live
  door;
- the adapter grows a dependency on core, binding, or plugins;
- ordinary turns on this path return to condition-5 latency (order-of-minutes) as the
  designed shape of a teaching turn.

## Deferred

Host trunk, typed map and Petrinaut read/write via existing `onToolCall`, capture improvement
(token-threshold observer, typed payloads), and whether capture and runbooks converge, are
clustered in [`MISSION.next.md`](MISSION.next.md). That draft does not supersede this
section.
