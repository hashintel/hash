---
"@hashintel/petrinaut": patch
---

Fix three defects in the ad-hoc scenario form: the optimize bounds popover
ignored every press (Min, Max, Step and Scale were uneditable, and each press
dismissed it), a focused section painted over the sticky header of the section
hosting it, and the experiment drawer's computed initial state grew unbounded
instead of scrolling in its own region.
