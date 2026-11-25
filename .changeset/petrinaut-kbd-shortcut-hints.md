---
"@hashintel/petrinaut": patch
---

**Breaking:** `KeyboardShortcut` no longer accepts `inMenu` — remove the prop, a shortcut in a menu item's suffix now aligns itself. `KeyboardShortcut` and `formatShortcutKeys` now put modifiers first in the platform's order, and `KeyboardShortcut` shows a combination in one keycap.
