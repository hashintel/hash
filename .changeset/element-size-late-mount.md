---
"@hashintel/petrinaut": patch
---

`useElementSize` now follows an element that mounts after the first render (or is swapped), instead of observing only what the ref held on mount — a metric timeline that mounts before its first frame arrives no longer stays blank.
