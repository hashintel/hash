---
"@hashintel/petrinaut": patch
---

A firing only animates where it can be seen: nodes and arcs off the side of the canvas, or drawn at a zoom small enough that a node is a few pixels across, skip the flash. On a thousand-node net a scrub goes from 13 to 44 frames per second and playback from 16 to 39.
