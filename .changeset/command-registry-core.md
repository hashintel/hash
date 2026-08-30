---
"@hashintel/petrinaut-core": patch
---

Added a palette command registry: `createCommandRegistry()` (register/list/subscribe/execute with replace-by-id and disposers), `combineCommandRegistries()` for merging read views across sources, and a `commandRegistry` option on `createPetrinaut` so the instance registers its own commands (auto-layout) for the instance's lifetime.
