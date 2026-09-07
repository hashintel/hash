---
"@hashintel/petrinaut": patch
---

Native scrollbars across the editor now use the design-system styling: a rounded thumb on an invisible track instead of the platform default, hidden until the pointer is over the scroll container or it is being scrolled, unless the user's system always shows scrollbars. The two simulation-results drawers no longer force `scrollbar-width: thin`, which disabled that styling in Chromium and Safari.
