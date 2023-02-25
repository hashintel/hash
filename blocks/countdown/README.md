The Countdown block displays the number of days, months, and years until a particular target date. The date is selected with an intuitive date picker and a title can be added above the countdown to provide additional context. Optionally, the number of minutes and hours can also be shown.

The block accepts `targetDateTime` \[string] in ISO 8601 **date and time** format and uses the Graph Module's `updateEntity` method to store this in the embedding application's storage. `title` \[string] and `displayTime` \[boolean] properties set the title and hours and minutes options respectively.

Learn more about the date and time format here: https://en.wikipedia.org/wiki/ISO_8601.
