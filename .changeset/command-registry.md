---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Added a command registry for host-rendered command palettes. Core: `createCommandRegistry()`, `combineCommandRegistries()`, and a `commandRegistry` option on `createPetrinaut` that registers the instance's commands for its lifetime. React (`@hashintel/petrinaut/react`): `CommandRegistryProvider`, `useCommand(command, { when })`, `useCommands()`, and `formatShortcutKeys()`; the editor registers its undo/redo, tool, search, and panel commands. Petrinaut ships no palette.
