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

## Q4. Undo/redo

Pass-through (today) vs default-implementation-with-override.

- **Today:** host implements it; Core just exposes the interface.
- **Recommendation:** keep pass-through. A default implementation would need to know about the document model, which depends on Q1.
- **Status:** open, but low risk.

## Q5. ~~Worker bundling~~

**Decided.** `/core` accepts a caller-provided `createWorker` factory; the worker source is exposed as a `./core/simulation.worker` sub-entry that consumers resolve via `new URL(..., import.meta.url)`. `/ui` supplies a default factory so most consumers don't see this. See [05-simulation.md](./05-simulation.md) §5.2.

## Q6. Lazy subsystems

Does `createPetrinaut` spin up the simulation worker eagerly, or lazily when `startSimulation()` is called?

- **Recommendation:** lazy. Headless consumers that only mutate a definition shouldn't pay the cost.
- **Status:** effectively decided in [05-simulation.md](./05-simulation.md) §5.3 — confirm and strike.

## Q7. Notifications

Are notifications part of core's output (semantic events the UI renders as toasts) or do they stay react-only?

- **Recommendation:** core-output. Notifications are *what happened*; rendering them as toasts is a UI choice.
- **Status:** open, but low risk.

## Q8. Error tracker

Stays as a passed-in interface (`{ captureException, ... }`); core uses it directly, react keeps its existing context for UI components that want it.

- **Status:** effectively decided — confirm and strike.

## Q9. Package shape

One package with three entry points (`exports` map: `./core`, `./react`, `./ui`) vs three packages.

- **Recommendation:** one package, `exports` map, with each entry's externals declared via the build's `external` config so `/core` consumers don't transitively pull React or Monaco.
- **Status:** effectively decided — confirm and strike.

## Q10. Examples & file-format purity

Confirm `import-sdcpn` is fully pure (no implicit DOM use); confirm examples don't transitively import UI helpers.

- **Status:** verification task during Phase 1, not a design choice.

---

## Iteration discipline

When a question is resolved:

1. Move the conclusion into the relevant chapter.
2. Strike through the question here with `~~Q?. …~~` and add **Decided.** + a pointer to the new home.
3. If the conclusion changes a chapter's content, update that chapter in the same edit.

This keeps `07-open-questions.md` honest — at any point, the un-struck questions are exactly the things still up for debate.
