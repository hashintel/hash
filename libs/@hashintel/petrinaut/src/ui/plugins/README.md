# Plugins

The plugin API and its runtime: how a plugin is defined, how the editor runs
it, and how what it returns reaches the editor's UI. The layer is declared in
`define-petrinaut-plugin.ts` (`@layerRoot ui.plugins`). Author-facing
documentation lives in the architecture docs under `plugins/`; this file
describes the code.

## Files

| File                                                  | Holds                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `define-petrinaut-plugin.ts`                          | The public types (manifest, `api`, contributions, hook) and `definePetrinautPlugin`, `pluginService`, `pluginCommandId`. |
| `plugin-access.ts`                                    | The `document`, `experiments` and `editor` families of `api`, at `read` and `write` levels, and `EditResult` refusals.   |
| `plugin-editor.tsx`                                   | One plugin editor per core instance: the access families, `errors`, `notifications`, and the stores the actions read.    |
| `plugin-editor/use-canvas-controller-registration.ts` | Where the canvas registers its controller, so `applyAutoLayout` can frame the net once drawn.                            |
| `plugins-provider.tsx`                                | `PetrinautPluginsProvider`: one host per running plugin, the contributions store, and the hooks the view reads it with.  |
| `plugin-commands.tsx`                                 | Registers a plugin's declared commands in the ambient command registry.                                                  |
| `plugin-settings.ts`                                  | One plugin's settings: loaded from `localStorage`, checked against the manifest, persisted on `set`.                     |
| `plugin-settings-rows.tsx`                            | The rows User settings renders for every running plugin's settings.                                                      |
| `plugin-statuses.ts`                                  | Each plugin's status, `on`, `off` or `failed`, in the host's order.                                                      |
| `plugin-contributions.ts`                             | What a manifest declares, as tags for the plugin's row in User settings.                                                 |
| `plugin-outlets.tsx`                                  | Where the view renders buttons, top-bar items and roots.                                                                 |
| `plugin-boundary.tsx`                                 | Suspense plus an error boundary around each host and each contribution; reports failures to the error tracker.           |
| `plugins-test-harness.tsx`                            | `renderPlugins`: renders plugins beside a view under the editor's providers, for tests.                                  |

## How a plugin reaches the editor

```text
definePetrinautPlugin(manifest)        plain data, readable without running plugin code
        │
        ▼
createXPlugin(hook | contributions)    a PetrinautPlugin: { manifest, hook, hostKey }
        │
        ▼  <Petrinaut plugins={[…]}>
PetrinautPluginsProvider
  ├─ resolvePluginStatuses             on / off / failed, duplicate ids rejected
  ├─ PluginEditorProvider              api families, built once per core instance
  ├─ PluginHost × running plugin       runs the hook with api, publishes contributions,
  │     └─ PluginCommandRegistrations  registers declared commands
  └─ ViewAfterHosts                    mounts the view after the hosts' first commit
                                              │
                      contributions store ◄───┘
                              │
        PluginToolbarItems, PluginRoots, PluginSettingsRows   (the view's outlets)
```

## Design

- **Hosts render beside the view, not around it.** A host runs the plugin's
  hook and publishes the result, in a layout effect, to a store the view's
  outlets read with `useRunningPlugins`. A plugin switched on, off, failing or
  remounting therefore never remounts the view.
- **`api` is built once per core instance.** `PluginEditorProvider` creates
  the access families when the instance changes, as a `readonly` toggle does.
  Render-scoped inputs (read-only reason, viewed subnet, `setTitle`, records)
  go into stores that `PluginEditorSync` updates in the first layout effect of
  every commit; actions read them when called. A plugin's `api` object changes
  only when its settings snapshot changes.
- **Undeclared means absent.** `accessApi` picks from the families only what
  the manifest's `access` names, and `PluginApi` types the same shape, so the
  type and the runtime object cannot disagree.
- **Contributions are typed from the manifest.** `PluginContributions`
  requires every declared key and rejects every other one; a button's
  `command` is one of the manifest's command keys.
- **Commands reuse the registry's React binding.** Each declared command is one
  `useCommand` registration under `<plugin id>.<key>`, replaced only when the
  spec changes, dropped while `when` is `false` or once the host unmounts.
- **Every plugin fails alone.** `PluginBoundary` wraps each host and each
  contribution. A hook that throws marks the plugin `failed`; a contribution
  that throws renders nothing. Both are reported with the plugin's id and the
  place.
- **Settings are per plugin and per browser.** Stored under
  `petrinaut:plugin:<id>`; a stored value the spec rejects reads as the
  default. A change gives a new snapshot, which re-runs the hook.

## React Compiler

`PluginHost` calls a hook that differs per plugin, which the compiler cannot
compile, so it opts out with `"use no memo"`; a host is keyed by its plugin's
`hostKey`, so it calls one hook for life. `usePluginApi` opts in with
`"use memo"` because it calls no hook. Plugin hooks are annotated with
`PluginHook`, never `satisfies`, which the compiler skips.

## Consumers

- `ui/petrinaut.tsx` mounts `PetrinautPluginsProvider` inside the editor's
  providers and supplies a command registry when the host passes none.
- The editor view renders the outlets; User settings renders
  `PluginSettingsRows` and, under Plugins, one row per status entry.
- `ui/index.ts` and `main.ts` export the definition, the types and the hooks
  plugin code imports.

## Tests

Each module has a test beside it. `plugins-provider.test.tsx` covers the
runtime end to end through `renderPlugins`: hook and object forms, `api`
identity, settings, failures, services, remounts and commands.
`define-petrinaut-plugin.test.ts` checks the types with `@ts-expect-error`.
