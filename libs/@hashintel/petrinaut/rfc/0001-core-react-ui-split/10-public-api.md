# 10 — Public API summary

## Imports after the split

```ts
// Headless engine
import { createPetrinaut } from "@hashintel/petrinaut/core";
import type { SDCPN, Place, Transition, /* … */ } from "@hashintel/petrinaut/core";

// React bindings (build your own UI)
import {
  PetrinautProvider,
  usePetrinautInstance,
  usePetrinautDefinition,
  useSimulationStatus,
  /* … */
} from "@hashintel/petrinaut/react";

// Opinionated editor (default for most consumers)
import { Petrinaut } from "@hashintel/petrinaut/ui";
```

## Layer dependency direction

**`ui` → `react` → `core`**, never reversed, never skipping a layer.

- `/ui` files **must not** import from `/core` directly. They go through `/react` hooks. This keeps the abstraction honest: if a UI file imports from `/core`, it bypasses the React bindings layer and re-creates the coupling we're trying to remove.
- `/react` files **may** import types from `/core` and call into a Core instance, but **must not** know about visual components or DOM APIs.
- `/core` files **must not** import from `/react` or `/ui`. Enforced by file-system layout and (post-merge) by an ESLint rule.

## What the default top-level entry exports

`@hashintel/petrinaut` (no sub-path) re-exports `/ui` for back-compat with today's consumers — they keep working without changes.

Domain types previously exposed at the top level (`SDCPN`, `Place`, etc.) are also re-exported there, but the canonical home is `/core`.

## Worker sub-entry

`@hashintel/petrinaut/core/simulation.worker` is a fourth entry that exists **only as a worker source URL**. It is not meant to be imported as a module — only resolved via `new URL(..., import.meta.url)` and passed to `new Worker(...)`. See [05-simulation.md](./05-simulation.md) §5.2.
