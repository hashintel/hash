# RFC 0001 — Petrinaut: Core / React / UI Split

**Status:** Draft (iterating) — Phase 0 spike + Phase 2a (simulation transport) landed
**Authors:** @cf
**Created:** 2026-04-28
**Last updated:** 2026-05-02
**Tracking issue:** FE-628

---

## Summary

Restructure `@hashintel/petrinaut` into three import paths:

- **`@hashintel/petrinaut/core`** — stateful, headless instance. No React, no DOM, no Monaco. Inputs and outputs flow through streams.
- **`@hashintel/petrinaut/react`** — React bindings: hooks, contexts, and bridge providers that synchronize a Core instance with React. No visual widgets.
- **`@hashintel/petrinaut/ui`** — the opinionated visual editor: `<Petrinaut>`, all views, panels, and components. Built on top of `/react`.

Layer dependency direction: **`ui` → `react` → `core`**, never the reverse, and `/ui` should not reach into `/core` directly — always through `/react` hooks.

## Why

- Enable non-React consumers (CLI tools, headless automation, server-side simulation).
- Let advanced consumers build alternative UIs against `/react` without forking the editor.
- Keep the polished editor available out of the box via `/ui`.
- Make the boundary between *what the system does* and *how it is rendered* explicit.

## Reading order

| # | File | Purpose |
| - | ---- | ------- |
| 01 | [01-motivation.md](./01-motivation.md) | Goals + non-goals |
| 02 | [02-current-state.md](./02-current-state.md) | The provider stack today and the SDCPN ownership model |
| 03 | [03-layering.md](./03-layering.md) | What goes in `core` / `react` / `ui` |
| 04 | [04-core-instance.md](./04-core-instance.md) | `createPetrinaut()` surface, streams, instantiation |
| 05 | [05-simulation.md](./05-simulation.md) | Simulation patterns (locked) |
| 06 | [06-react-bindings.md](./06-react-bindings.md) | `<PetrinautProvider>` + hooks; how `/ui` consumes them |
| 07 | [07-open-questions.md](./07-open-questions.md) | The hot file while the RFC is in flight |
| 08 | [08-migration.md](./08-migration.md) | Phased migration plan |
| 09 | [09-risks.md](./09-risks.md) | Risks and likely surprises |
| 10 | [10-public-api.md](./10-public-api.md) | Final import surface summary |
| 11 | [11-headless-usage.md](./11-headless-usage.md) | Using Petrinaut without any UI — handle setup, simulation, type-checking, subscriptions |

## Decisions locked so far

- Three entry points: `core`, `react`, `ui` (not two; not `hooks`).
- Single package with an `exports` map, not three separate packages.
- Simulation worker lives in `/core`; bundling via caller-provided `createWorker` factory + `./core/simulation.worker` sub-entry. See [05-simulation.md](./05-simulation.md).
- Stream primitive: `ReadableStore<T>` (`get` + value-passing `subscribe`) for state, `EventStream<T>` for one-shot events. React adapts via a `useStore` helper. See [04-core-instance.md](./04-core-instance.md) §4.2.
- Document never owned by Core — Core takes a `PetrinautDocHandle` (adapts plain JSON, Immer, Automerge, …). `createJsonDocHandle` shipped for the common case. See [04-core-instance.md](./04-core-instance.md) §4.1.
- Patches: Petrinaut-defined minimal `PetrinautPatch` type (Immer-shaped: array path, `op: add | remove | replace`). Adds `immer` (~14 KB) as a `/core` dep. Patches are in-memory only, never persisted. See [04-core-instance.md](./04-core-instance.md) §4.1.
- Undo/redo lives on the handle as an optional `history` field. `createJsonDocHandle` ships a default Immer-based implementation; the host's `UndoRedoContextValue` pass-through goes away. Coalescing of typing-bursts is a deferred follow-up. See [04-core-instance.md](./04-core-instance.md) §4.1 "History (locked)".
- Phase 0 spike landed: `createJsonDocHandle` (with history), `createPetrinaut`, `useStore`, `<PetrinautNext>`, two Storybook stories, 15 smoke tests. Demo site (`apps/petrinaut-website`) migrated to the handle-driven path; per-net history preserved across switches. See [08-migration.md](./08-migration.md) Phase 0.
- Phase 2a landed: `SimulationTransport` interface, `createWorkerTransport(createWorker)`, `startSimulation({ transport, config })` returning a `Simulation` handle (status / frames / events stores, run/pause/reset/ack/setBackpressure/getFrame/dispose actions). `instance.simulation` + `instance.startSimulation()` available. `/react` bridge + `<SimulationProvider>` swap is the next step. See [05-simulation.md](./05-simulation.md) §5.8.

## What this RFC does *not* cover

- Collaborative editing (Automerge / Yjs) wire-up — only the document-ownership decision that affects it.
- Worker pool strategies (one worker per instance vs shared pool).
- Public docs / migration guide for external consumers — to be written once the RFC is accepted.

## Iteration protocol

While this RFC is in flight, most edits land in [07-open-questions.md](./07-open-questions.md). Once a question is resolved, its conclusion migrates into the relevant chapter, and the question is struck through with a pointer to where the decision now lives.
