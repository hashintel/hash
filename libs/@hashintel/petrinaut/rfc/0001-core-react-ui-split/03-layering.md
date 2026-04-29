# 03 — Layering

## 3.1 What goes in `core/` (no React, no DOM)

- **Domain types** — `core/types/sdcpn.ts`, `core/schemas/`, `core/errors.ts`. Already pure. Move as-is.
- **Simulation engine** — `simulation/simulator/*`, `simulation/compile-scenario.ts`. Already pure.
- **Simulation worker** — `simulation/worker/*` (worker code + typed message protocol). Headless; uses `postMessage`. Bundling solved via caller-provided factory — see [05-simulation.md](./05-simulation.md).
- **Validation** — `validation/*`. Pure regex/naming rules.
- **File format** — `file-format/import-sdcpn.ts`, `file-format/types.ts`. Pure deserialization. Browser-download trigger lives in `/ui` (it touches the DOM).
- **Clipboard (logic)** — `clipboard/serialize.ts`, `clipboard/paste.ts`. Pure marshaling. `navigator.clipboard` wrapper stays in `/ui`.
- **Examples** — `examples/*`. Static SDCPN data; useful for tests and demos in any layer.
- **Selection types** — `state/selection.ts`. Pure data; the *concept* of a selection map. (Whether the selection itself is owned by core or by the UI is an open question — see [07-open-questions.md](./07-open-questions.md).)
- **Layout** — `lib/layout/*` (elkjs auto-layout, if pure). Verify no DOM deps.
- **Deep-equal** — `lib/deep-equal.ts`. Pure.
- **The Core instance** — new: `core/instance.ts`. Top-level factory `createPetrinaut(...)` returning a stateful object with input/output streams. See [04-core-instance.md](./04-core-instance.md).

## 3.2 What goes in `react/` (React bindings, no visual widgets)

The `/react` layer is everything you'd need to build a different UI on top of Core: hooks, contexts, and the bridge providers that turn Core's streams into React state. **No JSX that renders to the screen.**

- **Instance context + factory hook** — new: `react/instance-context.ts`, `react/use-petrinaut-instance.ts`. Holds the Core instance; `usePetrinaut*()` hooks read from it via `useSyncExternalStore`.
- **Bridge providers** — `state/sdcpn-provider.tsx`, `state/mutation-provider.tsx`, `simulation/provider.tsx`, `playback/provider.tsx`, `lsp/provider.tsx`, `notifications/provider.tsx`. Re-shaped to subscribe to a Core instance and republish via React Context.
- **Editor UI state (no Core counterpart)** — `state/editor-context.ts`, `state/editor-provider.tsx`, `state/user-settings-context.ts`, `state/user-settings-provider.tsx`, `state/use-selection.ts`, etc. React-only state for panel widths, modes, sidebar, selection. Lives in `/react` so alternative UIs can reuse it.
- **Undo/redo context** — `state/undo-redo-context.ts`. Pure React glue for the host-provided undo/redo interface.
- **Error tracker context** — `error-tracker/error-tracker.context.ts`. Stays as a React context.
- **Convenience hooks** — `state/use-is-read-only.ts`, `state/use-sync-editor-to-settings.ts`, etc. Move with their providers.

## 3.3 What goes in `ui/` (the editor itself)

- **Top-level component** — `petrinaut.tsx` rebuilt as a thin wrapper. Creates a Core instance, mounts the `/react` providers, then renders `EditorView`.
- **Editor view + components** — `views/`, `components/`. All visual UI.
- **Monaco integration** — `monaco/*`. Loads + configures the editor; subscribes to LSP via `/react` hooks.
- **Notifications UI** — `notifications/*` (rendering side). Toast components. The *event stream* lives in core; the *toast UI* lives here.
- **Resize / portal helpers** — `resize/`, `state/portal-container-context.tsx`. UI infra.
- **File-format download** — `file-format/export-sdcpn.ts` (DOM bits only). The *serialization* moves to core; the *trigger-a-browser-download* part stays here.
- **Clipboard browser wrapper** — `clipboard/clipboard.ts` (`navigator.clipboard` calls). Pure marshaling moves to core; the browser API call stays here.

## 3.4 Ambiguous items (pending decisions in [07-open-questions.md](./07-open-questions.md))

- **Editor state** (selection, current mode, panel layout, user settings): leaning toward **react-only**, because nothing in core needs to know which node is highlighted. But if a non-React consumer wants "what is the user pointing at" semantics, we may want a thin selection slice in core.
- **Undo/redo:** today it's a pass-through interface — host implements it. Should core own a default in-memory history (with the host able to replace it), or stay pass-through? Probably pass-through stays.
- **LSP**: the worker logic is pure and headless; the React provider is just glue. The worker itself fits in core, but Monaco's binding to it stays in `/ui` (via `/react` hooks). The diagnostics stream is a clean core output.
- **Notifications**: today these are toasts. Notifications are *outputs*; core should emit them as events, and `/ui` can render them as toasts.
