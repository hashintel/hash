# Read Arcs Analysis

## Semantics

Read arcs are input arcs with the same structural enablement condition as standard arcs: the source place must contain at least `weight` tokens. For coloured places, those selected tokens are provided to both `Lambda` and `TransitionKernel` under `input.<PlaceName>`, with tuple length equal to the arc weight.

The difference from standard arcs is consumption. When a transition fires, standard input arc tokens are removed immediately, while read arc tokens remain in their source place. Inhibitor arcs remain separate: they are enabled only when the source place has fewer than `weight` tokens, do not consume tokens, and are not included in lambda/kernel input.

## Impacted Areas

- Core SDCPN model: `InputArc.type` now accepts `"read"` alongside `"standard"` and `"inhibitor"`.
- Validation and import paths: runtime schemas, file import, and clipboard import accept read arcs while preserving the existing default of `"standard"` for older payloads.
- Mutations and AI tools: `addArc` can create typed input arcs directly, and `updateArcType` can switch an input arc to read.
- Simulation engine: read arcs participate in token combination enumeration for lambda/kernel input but are excluded from removal maps.
- Monte Carlo engine: the packed-buffer execution path mirrors the standard engine semantics.
- LSP code surface: read arcs contribute typed input properties just like standard arcs; inhibitor arcs are still omitted.
- UI: read arcs are selectable in the arc properties panel, shown in transition arc lists, and rendered distinctly on the canvas.
- Docs: user-facing arc semantics now describe standard, read, and inhibitor input arc behavior.

## Key Edge Cases

- Read-only uncoloured places still gate enablement but do not appear in lambda/kernel input, matching existing uncoloured standard arc behavior.
- A transition with only coloured read arcs can fire repeatedly while inspecting the same tokens, unless another input, predicate, output effect, or time limit stops it.
- The existing arc identity model is still place-to-transition based, so parallel input arcs from the same place to the same transition are not introduced by this change.

## Verification Added

- Structural enablement tests for read arcs.
- Single-step transition tests proving read arc tokens reach lambda/kernel input and are not removed.
- Full frame execution coverage showing read tokens remain after firing.
- Monte Carlo coverage for non-consuming read arcs.
- LSP completion coverage for read arc token inputs.
- File and clipboard parsing coverage for `"read"` arc types.
