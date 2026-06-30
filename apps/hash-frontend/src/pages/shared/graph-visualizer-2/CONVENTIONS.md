# Graph Visualizer v2: Code Conventions

## Types

- **`type` over `interface`** unless the type genuinely needs declaration merging (it almost never does here).
- **`readonly` on all fields** by default. Mutable state is explicit and rare.
- **Branded primitives** for index/ID types (`EntityIdx`, `ClusterId`, etc.) via `brand.ts`. These prevent mixing structurally identical numbers/strings at compile time.
- **Types live where they're owned**, not in a central `types.ts`. The render layer owns render types. The worker protocol owns message types. Shared domain primitives (branded IDs, enums used across layers) get their own small focused files.

## File organization

- Each file has a single clear purpose. If a file accumulates unrelated concerns, split it.
- Types that are only used within one file stay in that file; extract only when shared.
- Barrel exports (`index.ts`) are kept minimal: re-export the public surface, nothing internal.

## Where types belong

| Type                                                            | Lives in                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| Branded primitives (`EntityIdx`, `EntityId`, `TypeSetKey`, ...) | `ids.ts`                                                   |
| `VizMode`, `LodMode`, `ClusterKind`                             | `ids.ts` (small, foundational, used everywhere)            |
| `VizConfig`, `defaultVizConfig`                                 | `config.ts`                                                |
| `RenderCluster`, `RenderEntity`, `RenderEdge`, `RenderFrame`    | `rendering/types.ts`                                       |
| `MainToWorkerMessage`, `WorkerToMainMessage`                    | `clustering/worker-protocol.ts`                            |
| Worker-internal types (columnar storage, cluster tree, etc.)    | `clustering/` subdirectory, co-located with implementation |
| Frontier types                                                  | `exploration/types.ts`                                     |
| Interaction types (picking, drag, viewport)                     | `interaction/types.ts`                                     |

## Style

- `interface` for all object shapes. `type` only for unions, intersections, and aliases.
- `readonly` on all fields by default.
- Prefer `const` assertions and literal types over enums.
- Discriminated unions for message types (the `type` field).
- No `any`. No `as` casts unless at a boundary with documented justification.
- No ASCII banners or decorative comment separators.
- Document non-obvious invariants in comments. Don't narrate structure the code already shows.
- Never comment what was removed or changed (`// removed X`, `// previously…`, `// used to…`, "no longer needed"). The code shows what IS, not what WAS — history is git's job.
- Never take shortcuts. When patches stop converging, STOP — step back and rework the module wholesale rather than patch-on-patch. A clean rework usually beats serial patches on a failing design, and a genuine shift can require fundamentally changing something; don't cling to the existing structure to dodge the rework. Correctness and performance are the bar above all.

## Worker boundary

- The worker owns all heavy state (entities, links, clusters, layout).
- The main thread receives **render payloads only**: compact, readonly, ready to feed to Deck.gl.
- Message types are the contract between threads. Changes to message types should be deliberate.
- Use `Float32Array` / transferable buffers for large position data. Do not serialize millions of objects.

## Incremental development

- Build the simplest thing that renders first. Add complexity only when the simpler version is working.
- Each layer (clustering, rendering, interaction, exploration) should be independently testable against its types.
