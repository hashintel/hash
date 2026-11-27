---
"@hashintel/ds-components": patch
---

`Drawer` and `Dialog` accept `onCloseRequest`, called when a dismissal is requested (close button, `Escape`, backdrop, or the `Drawer`'s swipe) before the exit animation plays — return `false` to keep the overlay open and handle the request yourself.
