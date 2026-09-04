# Mission 4 local/restricted product witness — invalid attempt

## Status

This witness is retained as historical product-boundary failure evidence. It does not satisfy Mission 4's routing or same-frozen-instrument proof, and its prior owner acceptance is withdrawn.

The [owner-gate clarification](../../decisions/mission-4-owner-gates-2026-09-02.md) confirms that the witness-only exact-URI repair and the original witness acceptance were authorized while the work was running. That historical authorization does not delegate witness acceptance or closure to a builder and does not authorize another witness or a post-freeze repair.

## Boundary exercised

The repaired local Petrinaut panel crossed:

```text
real Petrinaut panel :4915
  → same-origin /api/chat proxy
  → brunch-agent :4322
  → AI SDK transport
  → production Flue ChatAgent
  → sdcpn-modelling skill
  → visible runbook-ir workpiece
```

This was a local/restricted product attempt, not a remote deployment.

## Initial failures and authorized repair

The first browser launch rendered blank. Browser evidence showed a Petrinaut `Maximum update depth exceeded` failure from a stale package bundle. Rebuilding `@hashintel/petrinaut-core` and `@hashintel/petrinaut` with their installed Vite 8.2.2, then rebuilding the website, restored the tracked panel without source changes.

The first visible conversation activated `sdcpn-modelling` but passed relative labels to `read_skill_resource`:

- `templates/workpiece.md`
- `references/universal-elicitation.md`

Flue rejected both because packaged skill files require the exact advertised URI. The agent continued without the resources and emitted a workpiece that mislabeled an inferred current state as expert evidence.

The owner authorized the smallest repair: instruct the model to pass the exact `/.flue/packaged-skills/...` URI advertised after `→`, never the logical label. Focused package, application build, and production-routing tests passed before the rerun.

## Repaired interaction

Conversation id: `ec5c509f-4a93-4327-9c50-25b0f26b8fb5`  
Application route: `http://127.0.0.1:4915/api/chat` proxied to `http://127.0.0.1:4322/api/chat`

The user supplied a bounded scheduling case. The assistant activated the skill, asked one focused question about whether a tint run could be interrupted, received the answer, and emitted a visible epistemically marked workpiece without mounting or using construction tools.

| Operation | Outcome |
| --- | --- |
| `activate_skill({ name: "sdcpn-modelling" })` | `output-available` |
| `read_skill_resource({ path: "/.flue/packaged-skills/skill%3Asdcpn-modelling%3A6c061650fd9e9474/templates/workpiece.md" })` | `output-available` |
| Visible `runbook-ir` | Rendered in the Petrinaut AI assistant |
| Construction tools | Not used or mounted |
| Net mutation | None |

## Why this witness is invalid

1. The assistant did not read `references/universal-elicitation.md` and `references/profile.md` before its substantive question, violating the complementary required-disclosure half of the routing oracle.
2. The exact-URI instruction repair occurred after the paid campaign's frozen source commit `794fe2fbf1eaeba3fc816c6e3d1755d7b444125d`, so this witness and the scored campaign did not exercise one exact frozen instrument.
3. The screenshots prove that the real panel rendered and displayed a Brunch response/workpiece, but they do not independently bind the proxy path, Flue conversation, skill activation, resource URI, or absence of construction tools to the visible interaction.
4. Raw Playwright snapshots and console output remain only in the ignored local `.playwright-cli/` scratch directory. They are not committed evidence and may be deleted by local cleanup.

## Retained visual artifacts

- `product-witness-initial.png` — blank first launch before rebuilding stale Petrinaut output.
- `product-witness-rebuilt.png` — restored panel before interaction.
- `product-witness-workpiece.png` — first visible workpiece with failed relative resource calls.
- `product-witness-repaired.png` — exact-URI rerun with the workpiece visible.

These images are historical diagnostics, not accepted witness proof.

## Required successor witness

After the parent freezes the final repaired instrument and any required campaign succeeds, exercise that exact instrument through the visible Petrinaut boundary. Retain enough raw trace to bind the browser interaction to the proxy route, Flue conversation, skill activation, ordered resource reads, absence of construction capabilities, and visible workpiece. The parent then presents that evidence to the owner for acceptance; the witness runner does not accept or close it.
