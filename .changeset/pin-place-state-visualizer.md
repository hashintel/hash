---
"@hashintel/petrinaut": patch
---

A place's state visualizer is reachable from the canvas in two steps, a button on hover and the panel on a click, and can be pinned open from a rounded glass pin in its top-right corner, so it stays in view while the timeline is scrubbed or the initial state edited. The box opens whether or not a simulation has run, drawing the initial marking before one has, grows into place from the edge facing its node, and keeps the hover while the pointer is on it. Its code compiles once and its picture is redrawn only when the frame, the marking, the parameters or the code move: on a scrub with an expensive visualizer pinned, 45 to 63 frames per second.
