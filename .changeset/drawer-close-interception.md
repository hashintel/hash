---
"@hashintel/ds-components": patch
---

`Drawer` accepts `onCloseRequest`, called when a dismissal is requested (close button, `Escape`, swipe, or backdrop) before the exit animation plays — return `false` to keep the drawer open and handle the request yourself.
