---
"@hashintel/petrinaut": patch
---

Add `renderComposerStatus` for host-owned status above the composer or expanded Voice dock, without changing the collapsed dock's height, and `renderSystemMessage` for host-owned system-note content. Pass the current `inputMode` to composer controls, keep composer controls available in the live Voice dock, and display system messages as visible notes in Chat and Voice. With `presentation: "brunch"`, composer controls sit at the leading edge of the composer and Voice dock, separate from submission and session actions.
