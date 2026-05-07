# 02 — Current state

## Provider stack

A single `<Petrinaut>` component (`src/petrinaut.tsx`) composes a stack of providers:

```text
NotificationsProvider
└─ UndoRedoContext
   └─ SDCPNProvider             ← holds petriNetDefinition + mutate callback (from props)
      └─ LanguageClientProvider ← LSP worker
         └─ MonacoProvider      ← editor framework
            └─ SimulationProvider ← wraps the simulation web worker
               └─ PlaybackProvider ← rAF loop + speed/frame index
                  └─ UserSettingsProvider
                     └─ EditorProvider ← UI mode/selection/panels
                        └─ MutationProvider ← typed mutation DSL
                           └─ EditorView (UI)
```

## Public surface

`src/main.ts` re-exports:

- `<Petrinaut>` component + `PetrinautProps`
- Domain types: `SDCPN`, `Place`, `Transition`, `Color`, `Parameter`, `DifferentialEquation`, `MinimalNetMetadata`, `MutateSDCPN`
- `isSDCPNEqual` deep-equal helper
- `ErrorTrackerContext` for error reporting

## Document ownership today

The host owns the SDCPN. `petriNetDefinition` and `mutatePetriNetDefinition` are passed in as props; the host wraps the mutator in `immer.produce`, `automerge.changeDoc`, etc. **Petrinaut does not own the document.**

That model is what enables collaborative editing without Petrinaut having to know about CRDTs. Any future split must preserve this affordance — see Q1 in [07-open-questions.md](./07-open-questions.md).

## What's already core-shaped

Several modules are already pure logic with no React dependencies. The split largely consists of moving them and removing their React wrappers, not rewriting them:

- `core/types/sdcpn.ts`, `core/schemas/`, `core/errors.ts`
- `simulation/simulator/*`, `simulation/compile-scenario.ts`
- `simulation/worker/*` (already a `postMessage`-based protocol)
- `lsp/worker/*` (already runs in a worker)
- `validation/*`
- `lib/deep-equal.ts`
- `examples/*`

## What's React-wrapped state that needs extracting

These hold real state, but the state itself isn't inherently React — it's the wrapping that is:

- `state/sdcpn-provider.tsx` — derives `getItemType()` from the definition.
- `state/mutation-provider.tsx` — typed mutation DSL over `mutatePetriNetDefinition`.
- `simulation/provider.tsx` — worker lifecycle + status mapping.
- `playback/provider.tsx` — rAF frame loop + speed/frame index.
- `lsp/provider.tsx` — language client glue (diagnostics push, completion/hover RPCs).
- `notifications/*` — emits notification events that the toaster renders.

## What's genuinely UI-only

- `views/`, `components/`
- `monaco/*` (editor framework)
- The toaster part of `notifications/*`
- `resize/`, `state/portal-container-context.tsx`
- `state/editor-context.ts`, `state/user-settings-*.ts` (panel widths, modes, selection — UI concerns with no Core counterpart)
- DOM-touching parts of `file-format/export-sdcpn.ts` and `clipboard/clipboard.ts`
