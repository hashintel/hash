---
"@hashintel/petrinaut": patch
---

Add `renderComposerStatus` for host-owned status above the composer or expanded Voice dock, without changing the collapsed dock's height. Pass the current `inputMode` to composer controls and keep composer controls available in the live Voice dock. With `presentation: "brunch"`, system messages display as visible notes in Chat and Voice, `renderSystemMessage` renders their content, and composer controls sit at the leading edge of the composer and Voice dock, separate from submission and session actions.
