# 01 — Motivation

## Goals

Restructure `@hashintel/petrinaut` into three import paths so that:

- **`@hashintel/petrinaut/core`** can be consumed without React, the DOM, or Monaco. A Node script, a CLI, a server-side simulation runner, or an alternative-framework binding can all instantiate a Petrinaut, mutate it, and run simulations against it.
- **`@hashintel/petrinaut/react`** carries the React-specific glue (hooks, contexts, bridge providers) that turns a Core instance into something React components can subscribe to. No visual widgets — anyone wanting to build a different UI on top of Core uses this layer.
- **`@hashintel/petrinaut/ui`** is the opinionated, polished editor we ship today. Most consumers continue to use just `<Petrinaut>` and never see `/core` or `/react`.

The split should make the boundary between *what the system does* (core) and *how it is rendered* (ui) explicit, with `/react` as the bridge.

## Non-goals

- **Collaborative editing as a first-class core concern.** Automerge / Yjs integration stays the host's responsibility; the RFC only commits to keeping that integration possible (likely via an "external document" mode — see Q1 in `07-open-questions.md`).
- **Framework-specific bindings beyond React.** A future `petrinaut/vue` or `petrinaut/solid` would slot into the same shape, but they're out of scope here.
- **Worker pool / multi-instance optimisation.** Each Petrinaut instance gets its own worker; sharing across instances is a future RFC if it becomes necessary.
- **A new public docs / migration guide.** Will follow once the RFC is accepted and merged.
- **Reworking the SDCPN type itself.** Existing types stay; only their location and wrappers change.

## Why now

- The provider stack in `petrinaut.tsx` has grown to ten layers. Each is a mix of Core-shaped logic and React glue, which makes it hard to reason about, hard to test in isolation, and impossible to reuse outside the editor.
- Headless simulation (CI lint of an SDCPN, server-side runs, snapshot-based regression tests) is increasingly desired but currently requires booting a React tree.
- The simulation engine and LSP worker are already pure / headless internally; only their wrappers prevent non-React reuse. The cost of doing this split now is low.
