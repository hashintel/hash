# 09 — Risks and likely surprises

Things that are easy to underestimate or that have bitten similar refactors before.

## Worker bundling under non-Vite consumers

The current worker setup uses Vite's `?worker` import, which is bundler-specific. The decision in [05-simulation.md](./05-simulation.md) §5.2 (caller-provided factory + `./core/simulation.worker` sub-entry) covers the common bundlers, but verifying it actually works in:

- Webpack 5
- esbuild (raw)
- Bun
- Node `worker_threads` (with the `web-worker` polyfill)

…is a Phase-2 task that can't be skipped. If the sub-entry approach turns out to need bundler-specific shims, fallback is shipping the worker as a string blob URL (the `web-worker` dep already supports this).

## React Compiler + external store

`useSyncExternalStore` is supported by React Compiler, but a few things to sanity-check:

- The compiler doesn't over-cache instance handles such that hooks read stale state.
- Subscribe callbacks aren't memoised in a way that drops subscriptions.
- The compiler doesn't try to memoise `instance.foo.subscribe` (which would break re-subscription on instance change).

Opt out with `"use no memo"` only where genuinely needed.

## Whole-string `replace` for text edits

`PetrinautPatch` is Immer-shaped, so any character change inside a long code field (guards, kernels, equations) emits a `replace` carrying the entire new string. Drawbacks:

- **Patch volume.** Keystrokes in a 10 KB code block produce 10 KB-per-stroke patches.
- **No collaborative text merging.** Character-level CRDTs need sub-string `splice` ops; whole-string replace can't merge concurrent edits without conflict.

Mitigation: deferred. See [Q1.c in 07-open-questions.md](./07-open-questions.md) and the "Known limitation: text-range edits" section in [04-core-instance.md](./04-core-instance.md) §4.1. Will be addressed by a follow-up RFC if/when collaboration or patch-volume becomes a real concern.

## Handle adapter drift

Core never owns the document — it receives a `PetrinautDocHandle`. For Automerge, consumers paste a small adapter that wraps `DocHandle<SDCPN>`. Two risks:

- **Automerge API drift.** If `automerge-repo` changes its `DocHandle` surface (e.g. `docSync` returning a different shape), the published adapter snippet goes stale. Mitigation: the adapter is short, version-tagged, and lives in a docs page rather than in Petrinaut's own code.
- **Patch-format mismatch.** Automerge patches don't map 1:1 to `PetrinautPatch` (e.g. `splice` becomes multiple `add` ops). If a consumer relies on Automerge-flavoured patches inside Petrinaut, they'll be confused. Mitigation: document the conversion explicitly in the adapter section.

## Layout (`elkjs`)

Confirm `lib/layout/*` runs without DOM. `elkjs` ships a Web Worker variant that may have implicit assumptions about the environment; pure JS variant should be fine but verify in Phase 1.

## Render-time `mutate` calls

The React mutation provider sometimes triggers a mutation as part of a render cycle (e.g. auto-layout reacting to a new node). Need to verify the new boundary doesn't introduce a cycle — specifically, that an async `instance.mutate` → `instance.definition.subscribe` → React re-render → `instance.mutate` chain can't infinite-loop. Likely solution: queue mutations through a microtask, but that may break ordering guarantees the current code relies on.

## Monaco + LSP timing

Monaco initialisation and LSP worker readiness have a current race that's masked by the React provider order. Once both move out of providers and into the Core instance, the sequencing has to be explicit (LSP ready before the editor opens a document). Phase 2 should document this contract before Phase 3.

## Notifications duplication

If notifications become core-output (Q7) and `/ui` renders them as toasts, ensure there's no path where both `/core` and `/ui` independently emit a toast for the same event.

## `@xyflow/react` boundary

`@xyflow/react` is heavily entangled with the editor view and is the second-largest dep (after Monaco). It must end up in `/ui` only. Phase 1 should grep for `@xyflow/react` imports in moved files and reject any in `/core` or `/react`.

## Storybook / demo site

The current Storybook setup imports the editor directly. After the split it should import from `/ui` and continue to work with no story changes — but the build wiring needs updating.
