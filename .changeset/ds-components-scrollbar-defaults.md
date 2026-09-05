---
"@hashintel/ds-components": patch
---

Overlay bodies (drawer, dialog, popover), selectable lists, and textareas no longer force `scrollbar-width: thin`. Their scroll containers now pick up the scrollbar styling of the surrounding theme scope; forcing a non-`auto` `scrollbar-width` disabled `::-webkit-scrollbar-*` customization on those elements in Chromium and Safari.
