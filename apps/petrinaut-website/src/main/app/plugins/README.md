---
layer: website.plugins
role: The Petrinaut plugins the demo site passes to the editor, one folder each
---

Every folder here is one Petrinaut plugin. Its `plugin.tsx` is the entry
point: the manifest, and the body bound to it. A short body is written there,
so the file shows what the plugin returns; a long one, Brunch's and Voice's,
lives in `plugin/use-<name>-plugin.tsx` and imports the manifest's type from
`../plugin`. Components never live in the entry. The rest of the folder is
that plugin's implementation, grouped in a few sub-folders when there is
enough of it to need grouping. `_shared/` holds what two plugins share; today
that is the conversation contract between Brunch and Voice.

| Folder             | Plugin id                 | Contributes                                                                |
| ------------------ | ------------------------- | -------------------------------------------------------------------------- |
| `brunch/`          | `website.brunch`          | The Brunch assistant and its Ledger tab; provides the conversation         |
| `voice/`           | `website.voice`           | Voice mode on Brunch's assistant; the Voice and Realtime flags             |
| `petrinaut-ai/`    | `website.petrinaut-ai`    | Petrinaut AI, Petrinaut's own assistant over the website's chat route      |
| `command-palette/` | `website.command-palette` | The ⌘K palette over the editor's command registry, with its top-bar button |

The demo shell (`../local-storage-demo/local-storage-demo-app.tsx`) chooses
the list and passes it to `<Petrinaut plugins>`. What a plugin needs from the
host and cannot read from Petrinaut reaches it through a context the host
provides above the editor, as `BrunchHostContext` in `brunch/brunch-host.ts`
does for Brunch.

User settings lists these plugins under Plugins, with a switch to run each
and the contributions its manifest declares.
