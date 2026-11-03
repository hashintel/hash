# Plugins

The plugin API and its runtime: how a plugin is defined, how the editor runs
it, and how what it returns reaches the editor's UI. The layer is declared in
`define-petrinaut-plugin.ts` (`@layerRoot ui.plugins`). `../plugin.ts` is the
`@hashintel/petrinaut/ui/plugin` entry: what `<Petrinaut plugins>` takes and
what plugin code imports. Author-facing
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
| `plugin-assistant.tsx`                                | The plugin that provides the AI assistant, its panel state and `AssistantPanelTitle`.                                    |
| `plugin-boundary.tsx`                                 | Suspense plus an error boundary around each host and each contribution; reports failures to the error tracker.           |
| `plugins-test-harness.tsx`                            | `renderPlugins`: renders plugins beside a view under the editor's providers, for tests.                                  |

## How a plugin reaches the editor

```text
definePetrinautPlugin(manifest)        plain data, readable without running plugin code
        │
        ▼
XPlugin(hook | contributions)          a PetrinautPlugin: { manifest, [pluginRuntime]: { hook, hostKey } }
        │
        ▼  <Petrinaut plugins={[…]}>
PetrinautPluginsProvider
  ├─ resolvePluginStatuses             on / off / failed, duplicate ids rejected
  └─ PluginEditorProvider              api families, built once per core instance
       ├─ PluginHost × running plugin  runs the hook with api, publishes contributions,
       │     └─ PluginCommandRegistrations  registers declared commands
       └─ ViewAfterHosts               mounts the view after the hosts' first commit
             └─ ReadOnlyActionProvider re-provides NetManagementContext with the first plugin's readOnlyAction
                                              │
                      contributions store ◄───┘
                              │
        PluginToolbarItems, PluginRoots, PluginSettingsRows,
        usePluginAssistant                                    (the view's outlets)
```

`definePetrinautPlugin(manifest, implementation)` returns the same plugin in
one call.

The read-only notice lives in the React layer, which cannot import this one,
so it reads the action from `NetManagementContext`.

## Design

[How the editor runs plugins](./runtime.mdx)
describes hosts, publishing, remounts, failures, settings storage and the
React Compiler directives. The
[Plugin API reference](./reference.mdx)
gives the typing rules.

## Consumers

- `ui/petrinaut.tsx` mounts `PetrinautPluginsProvider` inside the editor's
  providers and supplies a command registry when the host passes none.
- The editor view renders the outlets, and the assistant panel's shell around
  the providing plugin's content; User settings renders `PluginSettingsRows`
  and, under Plugins, one row per status entry.
- `ui/plugin.ts`, the `@hashintel/petrinaut/ui/plugin` entry, exports the
  definition, the types, the hooks and the components plugin code imports.

## Tests

`plugins-provider.test.tsx` covers the runtime end to end through
`renderPlugins`: hook and object forms, `api` identity, settings, failures,
services, remounts and commands. `plugin-editor.test.tsx` covers the access
families, and `define-petrinaut-plugin.test.ts` checks the types with
`@ts-expect-error`. Settings, statuses and contribution tags have unit tests
beside their modules.
