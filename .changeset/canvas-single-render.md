---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

The canvas renders centered on the net from its first frame, instead of jumping there after a first paint at the origin. petrinaut-core now owns node dimensions, net bounds and zoom limits; component instances grow with their port count; auto-layout on import no longer depends on the compact/classic setting.
