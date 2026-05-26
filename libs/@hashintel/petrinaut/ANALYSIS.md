# SDCPN Extension Capabilities

## Context

The Linear issue was not accessible from the local/browser session, so this analysis is based on the ticket summary in the task prompt.

CatCollab wants to integrate Petrinaut with a Petri-net definition that does not expose HASH's SDCPN extensions. A future `CatCollabPetriNetHandle` is a good fit for this boundary: it can adapt CatCollab's bare Petri-net shape into the existing Petrinaut document interface while declaring which Petrinaut capabilities are available.

The handle implementation is intentionally out of scope for this change.

## Implemented Shape

`@hashintel/petrinaut-core` now supports handle-level capabilities:

```ts
type PetrinautHandleCapabilities = {
  readonly?: boolean;
  disabledExtensions?: readonly PetrinautExtension[];
};
```

The supported extension keys are:

- `colors`
- `stochasticity`
- `dynamics`

Omitting `disabledExtensions` keeps the current default behavior, where all extensions are enabled. For CatCollab's bare Petri-net integration, the future handle can declare:

```ts
capabilities: {
  disabledExtensions: ["colors", "stochasticity", "dynamics"],
  readonly: true, // or false, depending on CatCollab's intended mode
}
```

The effective Petrinaut instance is read-only when either the host config or the handle capabilities request read-only mode.

## Touchpoints

Core package:

- `handle.ts`: accepts optional `capabilities` on `PetrinautDocHandle` and JSON handles.
- `instance.ts`: resolves capabilities once and exposes `extensions` and effective `readonly`.
- `actions.ts`: prevents disabled extension data from being created or retained during edits.
- `commands.ts`: strips disabled extension data from pasted definitions and skips unavailable selection types.
- `extensions.ts`: centralizes extension resolution, selection availability, and SDCPN sanitization.

React and UI package:

- `sdcpn-context.ts` and `sdcpn-provider.tsx`: expose active extension settings through context and selection typing.
- Left sidebar and search: hide token type and differential equation entry points when unavailable.
- Properties panel: hide color, dynamics, visualizer, differential-equation, and transition-result surfaces as applicable.
- Transition firing-time panel: hides the stochastic mode selector when stochasticity is unavailable.
- React Flow rendering: renders places and arcs without color semantics when colors are disabled, and disables dynamics markers when dynamics is unavailable.
- Simulation scenario and timeline views: treat all places as untyped when colors are disabled.

## Behavior With CatCollab-Style Bare Petri Nets

With `disabledExtensions: ["colors", "stochasticity", "dynamics"]`:

- Token types are unavailable in navigation, search, properties, selection cleanup, paste, and mutation actions.
- Differential equations and place dynamics are unavailable.
- Place color IDs, visualizer code, and dynamics fields are cleared or ignored.
- Stochastic transitions are coerced back to predicate transitions.
- Transition kernel code is cleared.
- Core mutation and paste paths sanitize SDCPN data so unavailable extensions do not persist after edits.

## Open Design Choices

- `disabledExtensions` was chosen instead of `enabledExtensions` for backward compatibility: existing handles keep all current SDCPN behavior without extra metadata.
- `colors` currently gates token types and several dependent behaviors. `dynamics` is also treated as dependent on `colors`, because equations target colored token types in the current SDCPN model.
- `stochasticity` only controls stochastic firing-time behavior. It does not currently disable all probabilistic simulation concepts if those are introduced elsewhere later.
- The future CatCollab handle still needs a clear mapping from CatCollab's bare Petri-net model into Petrinaut's SDCPN document shape.

## Potential Follow-Ups

- Filter AI tool schemas and prompts by active extensions. Core mutations now sanitize disabled data, but tool availability could be made more explicit to the AI layer.
- Decide whether other features should become separate capability flags for a truly bare Petri-net mode, such as inhibitor arcs, scenarios, metrics, parameters, or simulation-only views.
- Add import/export level sanitation so external document conversion cannot accidentally reintroduce disabled extension data.
- Consider making read-only reasons more specific in the UI, for example distinguishing simulation read-only from handle-level read-only.
- Add an actual `CatCollabPetriNetHandle` once CatCollab's source model and edit semantics are finalized.
