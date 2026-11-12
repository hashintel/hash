/**
 * Repeated facts (inbox `repeats-trim`, 12 Nov audit C1–C10), read from the URL only. With no `?repeats=` every
 * screen looks as it does today. `trim` shows each repeated fact once, in the place that owns it: the run panel's
 * Status, the top bar, the Name row, the column header.
 */
export const repeatsTrim =
  new URLSearchParams(globalThis.location.search).get("repeats") === "trim";
