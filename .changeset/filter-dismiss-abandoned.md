---
"@hashintel/ds-components": minor
---

`Filter`'s `removeable` prop accepts `dismissAbandoned`: when enabled, a chip left with an incomplete draft — no operator chosen, or any input empty, even if a value was committed before — after focus or clicks move outside it waits, fades out, then calls `onRemove`. Interacting with the chip or its dropdowns during the countdown rescues it; chips whose selected operator takes no input are never dismissed. Once fully faded, the removal itself waits for a quiet moment: while an overlay belonging to the chip's own filter group is open or the pointer rests over the group, the chip holds its place as a faint inert placeholder (so open dropdowns don't shift or close underneath the user), then leaves with a width-collapse animation once the interaction ends. A chip that was never held is removed instantly, with no placeholder or animation.
