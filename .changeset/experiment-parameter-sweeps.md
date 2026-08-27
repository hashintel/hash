---
"@hashintel/petrinaut": patch
---

Experiments sweep scenario parameters. A Sweep toggle per numeric parameter defines evenly spaced values (grids capped at 200 combinations), and the results drawer gains a pinned navigator: only the selected combination computes, in escalating run batches that stream into the charts, restarting the moment a control moves. Visited combinations keep their results and resume mid-ladder; every combination samples the same seed sequence, so differences between combinations come from the parameters. Sweeps run through the same CPU/GPU backend selection as plain experiments.
