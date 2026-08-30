---
"@hashintel/petrinaut": patch
---

Added the React seam for the command registry: `CommandRegistryProvider` (host-owned, shareable with `createPetrinaut`), `useCommand(command, { when })` for declaring commands from components with automatic unregistration, and `useCommands()` for host-rendered palettes, plus a platform-aware `formatShortcutKeys` helper for rendering shortcut keycaps. The editor registers a starter set of commands (tools, search, panel toggles); Petrinaut ships no palette of its own — a Storybook story and the demo website show host implementations.
