---
"@hashintel/petrinaut": patch
---

A place's visualizer is redrawn only when the frame, the marking, the parameters or its own code move, rather than on every re-render of the surface it sits on. On a scrub with an expensive visualizer pinned to the canvas that is 45 to 63 frames per second, with the worst frame down from 92ms to 51ms.
