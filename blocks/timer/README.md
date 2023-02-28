The Timer block provides a countdown timer with a novel UI. The remaining time is communicated with numbers and with a circular gradient, which shrinks in size counterclockwise towards 00:00. The number of minutes can be set by typing or by clicking plus and minus buttons, which add or subtract time in five minute chunks, while a reset button stops the countdown and restores the time remaining.

The block uses the Graph Module to persist its countdown through sessions and reloads. When the _play_ button is clicked, the block calls the `updateEntities` method and sets `targetDateTime` to _current time_ + `initialDuration`. When the timer reaches 00:00, `targetDateTime` is not unset to avoid duplicate entity updates if the timer is rendered in multiple places. If the value of `targetDateTime` points to the past, it is interpreted as undefined.

The Timer block accepts:

- `initialDuration` \[string] – ISO 8601 **duration**
- `pauseDuration` \[string]\[optional] – ISO 8601 **duration**
- `targetDateTime` \[string]\[optional] – ISO 8601 **date and time**

For example:

- `"PT42M24S"` corresponds to _42 minutes and 24 seconds_ in ISO 8601 **duration** format
- `"2022-01-31T12:00:00.000Z"` means _January 31<sup>st</sup>, 2022 at 12:00:00 PM UTC_ in ISO 8601 **date and time** format

Detailed format descriptions can be found at https://en.wikipedia.org/wiki/ISO_8601.

The only required property is the initial timer duration (`initialDuration`).
It needs to be between 1 second (`"PT1S"`) and 99 minutes 59 seconds (`"PT99M59S"`).

Invalid property values are auto-corrected to prevent runtime errors.
