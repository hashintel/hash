The Countdown block displays the number of days, months, and years until a particular target date. The date is selected with an intuitive date picker and a title can be added above the countdown to provide additional context. Optionally, the number of minutes and hours can also be shown.

## Programmatic Usage

The block accepts the following properties ([view the Countdown Block entity type](https://blockprotocol.org/@hash/types/entity-type/countdown-block/v/2) to see these in context):

- [`Title`](https://blockprotocol.org/@blockprotocol/types/property-type/title/)
- [`Target Date and Time`](https://blockprotocol.org/@hash/types/property-type/target-date-and-time/)
- [`Countdown Block should Display Time`](https://blockprotocol.org/@hash/types/property-type/countdown-block-should-display-time/)

It uses the Graph Module's `updateEntity` method to persist these in the embedding application's storage.
