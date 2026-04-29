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

## Collaborative editing (Automerge / Yjs)

Today the host owns the doc; if Core starts owning it (Q1 → owned-only mode), every collaborative consumer has to rewrite. **External-document mode must remain supported**, even if owned mode is the recommended default. The instantiation pattern in [04-core-instance.md](./04-core-instance.md) §4.4-A is the contract collaborative consumers depend on.

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
