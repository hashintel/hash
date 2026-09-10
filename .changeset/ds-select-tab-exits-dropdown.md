---
"@hashintel/ds-components": patch
---

Tab no longer traps focus in an open `Select` dropdown: it moves through the dropdown's own focusable elements (the search field, custom rows, footer buttons) and past the last of them closes the dropdown and moves focus to the document's next tabbable after the trigger; Shift+Tab traverses backwards and exits to the trigger.
