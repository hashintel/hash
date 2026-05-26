# Petrinaut Subnets Rebase Analysis

## Summary

This branch has been rebased onto `main` after the package split into `@hashintel/petrinaut-core` and `@hashintel/petrinaut`. The subnet data model and mutation logic now live in `@hashintel/petrinaut-core`; React/editor behavior lives in `@hashintel/petrinaut`.

The old branch has effectively been reapplied as one coherent change rather than preserving the pre-split commit structure.

## Implemented

- Added core SDCPN support for:
  - `Place.isPort`
  - `Subnet`
  - `ComponentInstance`
  - `Wire`
  - root and subnet-local `componentInstances`
- Added schema/action coverage for subnet and component authoring:
  - add/update/remove subnet
  - add/update/move/remove component instance
  - add/remove component instance wire
  - `targetSubnetId` on net-local mutations so places, transitions, arcs, types, parameters, and equations can be edited inside the active subnet
- Added stable wire IDs via `generateWireId` / `parseWireId`.
- Updated file import/export parsing, visual-info stripping/filling, graph layout, selection types, and connection highlighting for subnets/component instances/wires.
- Updated React editor behavior:
  - `ActiveNetProvider` and `ActiveNetContext`
  - Nets sidebar for switching between root and subnet definitions
  - active-net-aware lists, selection cleanup, keyboard shortcuts, clipboard paste, and auto-layout
  - component instance node rendering and dashed wire edge rendering in ReactFlow
  - add-component toolbar mode from subnet definitions
  - place properties toggle for marking a place as a component port
  - component instance properties panel
- Added a `Hospital Network with Subnet` bundled example in `@hashintel/petrinaut-core/examples`.

## Validation

- `yarn workspace @hashintel/petrinaut-core build`
- `yarn workspace @hashintel/petrinaut-core lint:tsc`
- `yarn workspace @hashintel/petrinaut-core lint:eslint`
- `yarn workspace @hashintel/petrinaut-core test:unit src/actions.test.ts src/commands.test.ts src/file-format/parse-sdcpn-file.test.ts src/clipboard/paste.test.ts src/clipboard/serialize.test.ts`
- `yarn workspace @hashintel/petrinaut lint:tsc`
- `yarn workspace @hashintel/petrinaut lint:eslint`
- `yarn workspace @hashintel/petrinaut test:unit src/react/hooks/use-petrinaut-commands.test.tsx src/react/hooks/use-petrinaut-mutations.test.tsx`

## Notes And Questions

- Wires are authoring-level merge declarations today. The editor can define and render them, and core validates that they connect parent places to subnet places marked `isPort`.
- Simulation flattening/composition is not implemented in this rebase. Running a simulation still uses the root net's current places/transitions. Making component instances executable needs a separate design pass because subnet code references place names, while a true merge rewrites internal port place IDs to external parent place IDs.
- Core allows nested `componentInstances` on subnets, matching the data model, but the toolbar currently exposes component placement only on the root net. This keeps the UI conservative and avoids recursive-composition UX questions.
- The DS component package needed regenerated ignored build artifacts locally for typechecking/build resolution after dependency refresh; those generated files are not part of this commit.
