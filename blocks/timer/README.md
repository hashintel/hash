The Timer block provides a countdown timer with a novel UI. The remaining time is communicated with numbers and with a circular gradient, which shrinks in size counterclockwise towards 00:00. The number of minutes can be set by typing or by clicking plus and minus buttons, which add or subtract time in five minute chunks, while a reset button stops the countdown and restores the time remaining.

## Programmatic Usage

It accepts the following properties ([view the Timer Block entity type](https://blockprotocol.org/@hash/types/entity-type/timer-block/v/2) to see these in context)

- [`Timer Block Total Duration`](https://blockprotocol.org/@hash/types/property-type/time-block-total-duration/)
- [`Timer Block Progress`](https://blockprotocol.org/@hash/types/property-type/timer-block-progress/)

Invalid property values are auto-corrected to prevent runtime errors.

The block uses the Graph Module to persist its countdown through sessions and reloads.

- When the _play_ button is clicked, the block calls the `updateEntities` method and sets the `Timer Block Progress` property to an object containing the _current time_ + the `Timer Block Total Duration`.
- When the _pause_ button is clicked, the sets the `Timer Block Progress` property to an object containing the elapsed duration of the timer, so it can be resumed later (with the new end time being recalculated).
- When the timer reaches 00:00, the `Timer Block Progress` is not unset to avoid duplicate entity updates if the timer is rendered in multiple places.
- If the value of the `Timer Block Progress` contains a time which points to the past, it is interpreted as undefined.
