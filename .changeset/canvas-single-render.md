---
"@hashintel/petrinaut": patch
---

The canvas renders centered on the net from its first frame, instead of jumping there after a first paint at the origin. Component instances grow with their port count so their ports have room, and auto-layout on import no longer depends on the compact/classic setting.
