# 07 — Open questions

The hot file while the RFC is in flight. Each question lists its current status. Decided questions are struck through with a pointer to where the conclusion lives.

## Q1. ~~Document ownership~~

**Decided.** Core never owns the document. It is given a `PetrinautDocHandle` — a single interface that adapts plain JSON, Immer-backed state, Automerge `DocHandle`, or anything else. The handle exposes `doc()`, `change(fn)`, `subscribe(listener)`, plus `id`, `state`, `whenReady()`. Subscriptions deliver `{ next, patches?, source? }` events. Repos, storage, and sync are host concerns — Petrinaut never sees a Repo. See [04-core-instance.md](./04-core-instance.md) §4.1 / §4.4.

### Q1.b. ~~Patch type~~

**Decided.** Petrinaut defines its own minimal `PetrinautPatch` type modeled on Immer's `produceWithPatches` shape (array path, `op: "add" | "remove" | "replace"`). Immer-backed handles (including `createJsonDocHandle`) emit it natively. Automerge consumers convert via a small switch in their adapter. No runtime dependency. See [04-core-instance.md](./04-core-instance.md) §4.1.

### Q1.c. Text-range edits — deferred

`PetrinautPatch` cannot represent sub-string operations; a one-character edit inside a long code block emits a `replace` with the entire new string. Acceptable for single-user editing today; will need addressing if/when:

- patch volume becomes a real problem on large code blocks, or
- collaborative code editing is introduced (character-level CRDTs require splice-on-string ops).

**Status:** deferred. Likely follow-up RFC; sketches in [04-core-instance.md](./04-core-instance.md) §4.1 ("Known limitation: text-range edits").

## Q2. ~~Stream primitive~~

**Decided.** `ReadableStore<T>` (`get()` + `subscribe(listener: (value: T) => void)`) for state slices; `EventStream<T>` (`subscribe(listener: (event: T) => void)`) for one-shot events. The listener receives the value on every call. React adapts via a `useStore(store)` helper that wraps `subscribe` to drop the value, so `useSyncExternalStore`'s ping shape is satisfied. See [04-core-instance.md](./04-core-instance.md) §4.2 and [06-react-bindings.md](./06-react-bindings.md) §6.3.

## Q3. Editor / UI state in core?

Selection, current mode, panel layout, user settings — does any of this belong in core?

- **Default:** no. Core doesn't need to know which node the user is highlighting.
- **Caveat:** collaborative cursors / multiplayer presence might want a thin selection slice in core.
- **Status:** open. Decision affects [03-layering.md](./03-layering.md) §3.4.

## Q4. ~~Undo/redo~~

**Decided.** Undo/redo lives on the handle as an optional `history` field. `createJsonDocHandle` ships a default Immer-based implementation (bounded stack, default 50 entries, truncate-on-mutate, `goToIndex` for version-history-style navigation). Other handles (Automerge, custom) implement their own. The host no longer wires history separately — the `UndoRedoContextValue` pass-through goes away. See [04-core-instance.md](./04-core-instance.md) §4.1 "History (locked)".

**Coalescing** (typing-burst → single undo entry) is a known follow-up — sketched in §4.1 "Coalescing — deferred", scheduled for Phase 3.

## Q5. ~~Worker bundling~~

**Decided.** `/core` accepts a caller-provided `createWorker` factory; the worker source is exposed as a `./core/simulation.worker` sub-entry that consumers resolve via `new URL(..., import.meta.url)`. `/ui` supplies a default factory so most consumers don't see this. See [05-simulation.md](./05-simulation.md) §5.2.

## Q6. ~~Lazy subsystems~~

**Decided / superseded.** Simulation is now decoupled from the `Petrinaut` instance entirely — the question of "eager vs lazy spin-up on the instance" no longer applies. `createSimulation` is its own top-level function; consumers who don't need simulation never call it. See [05-simulation.md](./05-simulation.md) §5.1.

## Q7. ~~Notifications~~

**Decided — folded into `simulation.events`.** The standalone `NotificationsProvider` / `useNotifications` system has been removed. Its only producer was "Simulation complete" — a single toast triggered when the simulation finished. That signal is already on the Core simulation handle's `events: EventStream<SimulationEvent>` stream; the React provider now subscribes to it directly and renders toasts via `<SimulationToaster>` inline. No parallel notification infrastructure needed today.

If a future use case introduces non-simulation notifications (LSP type-check failed, scenario imported, etc.), the right shape is to surface those via the same pattern — domain handle exposes an event stream, React provider renders a toaster — not to reinstate a generic notifications system.

## Q8. ~~Error tracker~~

**Removed for now.** The `ErrorTrackerContext` was published by the demo site but nothing inside the package consumed it — dead scaffolding. Left in place pending a real consumer (e.g. Core surfacing simulation/LSP worker exceptions through a host-provided tracker). When reintroduced, the interface lives in `/core` (pure) and the React Context lives in `/react`. See conversation thread in commit history for the rationale.

## Q9. ~~Package shape~~

**Decided.** One package with an `exports` map: `./core`, `./react`, `./ui`, plus the worker sub-entry `./core/simulation.worker`. Per-entry externals declared via the build's `external` config so `/core` consumers don't transitively pull React, Monaco, or `@xyflow/react`. To be implemented in Phase 5.

## Q10. ~~Examples & file-format purity~~

**Decided.** Verification task — not a design question. Will be performed during Phase 5 when the `/core` bundle is split out: any DOM / React import inside `/core/` files will fail the build's externals check. `examples/`, `validation/`, `lib/deep-equal.ts`, `clipboard/serialize.ts`, `clipboard/paste.ts`, `file-format/import-sdcpn.ts` are the candidates to grep for `react`, `document`, `window` imports.

---

## Iteration discipline

When a question is resolved:

1. Move the conclusion into the relevant chapter.
2. Strike through the question here with `~~Q?. …~~` and add **Decided.** + a pointer to the new home.
3. If the conclusion changes a chapter's content, update that chapter in the same edit.

This keeps `07-open-questions.md` honest — at any point, the un-struck questions are exactly the things still up for debate.
