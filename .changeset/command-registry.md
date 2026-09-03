---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Added a command registry for host-rendered command palettes: `createCommandRegistry()` and `combineCommandRegistries()` in core, and `CommandRegistryProvider`, `useCommand(command, { when })`, `useCommands()`, and `formatShortcutKeys()` in `@hashintel/petrinaut/react`. The editor registers its undo/redo, tool, auto-layout, search, and panel commands. Petrinaut ships no palette.
