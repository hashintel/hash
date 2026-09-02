# Mission 4 local/restricted product witness

## Verdict

The repaired local Petrinaut panel crossed the accepted visible boundary:

```text
real Petrinaut panel :4915
  → same-origin /api/chat proxy
  → brunch-agent :4322
  → AI SDK transport
  → production Flue ChatAgent
  → sdcpn-modelling skill
  → visible runbook-ir workpiece
```

This is a local/restricted product witness, not a remote deployment.

The owner accepted the scored architecture with explicit limitations and authorized a witness-only repair after the first panel run exposed incorrect resource invocation. No post-repair paid campaign or quality claim is made.

## Initial failures and repair

The first browser launch rendered blank. Browser evidence showed a Petrinaut `Maximum update depth exceeded` failure from a stale package bundle. Rebuilding `@hashintel/petrinaut-core` and `@hashintel/petrinaut` with their installed Vite 8.2.2, then rebuilding the website, restored the tracked panel without source changes.

The first visible conversation then activated `sdcpn-modelling` but passed relative labels to `read_skill_resource`:

- `templates/workpiece.md`
- `references/universal-elicitation.md`

Flue rejected both because packaged skill files require the exact advertised URI. The agent continued without the resources and emitted a workpiece that mislabeled an inferred current state as expert evidence.

The owner authorized the smallest repair: the skill now tells the model to pass the exact `/.flue/packaged-skills/...` URI shown after `→`, never the logical label. Focused package, application build, and production-routing tests passed before the rerun.

## Repaired visible interaction

Conversation id: `ec5c509f-4a93-4327-9c50-25b0f26b8fb5`  
Local principal: browser-local UUID retained only to identify this witness  
Application route: `http://127.0.0.1:4915/api/chat` proxied to `http://127.0.0.1:4322/api/chat`

The user supplied a bounded scheduling case: Line 2 had just finished white; a Meridian white was expected in roughly two hours; a tint was ready; white-to-tint and tint-to-white estimates were 45 minutes and three hours. The assistant activated the skill and asked one focused question about whether a tint run could be interrupted. The user answered that it must finish and cannot be abandoned without disallowed scrap, then requested the recoverable workpiece without net construction.

The production trace showed:

| Operation | Outcome |
| --- | --- |
| `activate_skill({ name: "sdcpn-modelling" })` | `output-available` |
| `read_skill_resource({ path: "/.flue/packaged-skills/skill%3Asdcpn-modelling%3A6c061650fd9e9474/templates/workpiece.md" })` | `output-available` |
| Visible `runbook-ir` | Rendered in the Petrinaut AI assistant |
| Construction tools | Not used or mounted |
| Net mutation | None |

The workpiece visibly separated expert evidence, working account, assumptions, checks, not-yet-asked material, two case paths, a cross-cutting issue ledger, consequential gaps, and net status.

## Honest limitation

The exact-URI repair worked for first workpiece creation. The assistant still did not read `references/universal-elicitation.md` and `references/profile.md` before its initial substantive question, despite the lifecycle instruction. This repeats the scored candidate's disclosure-restraint finding. Under the owner's accepted-limited disposition it remains an explicit limitation, not a hidden pass or a reason to claim general architecture superiority.

## Retained visual evidence

- `product-witness-initial.png` — blank first launch before rebuilding stale Petrinaut package output.
- `product-witness-workpiece.png` — first visible workpiece with failed relative resource calls.
- `product-witness-repaired.png` — repaired exact-URI run with the workpiece visible in the real panel.

`product-witness-rebuilt.png` is the restored panel before the interaction.
