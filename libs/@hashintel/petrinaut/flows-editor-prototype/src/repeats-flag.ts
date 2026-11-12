/**
 * Repeated facts (inbox `repeats-trim`, 12 Nov audit C1–C10), read from the URL only. With no `?repeats=` every
 * screen looks as it does today. `trim` shows each repeated fact once, in the place that owns it: the run panel's
 * Status, the top bar, the Name row, the column header.
 */
export const repeatsTrim =
  new URLSearchParams(globalThis.location.search).get("repeats") === "trim";

/**
 * The trims picked on 13 Nov (inbox repeats-trim, final: 7, 8, 9, 13), on by default; the rest stay behind
 * `?repeats=trim`. `?repeats=old` keeps all four.
 * 7 Logs D862 Outputs "Nothing", 8 Fetch file's needs-review "Asked 10:43" (no run id), 9 the entity block's title
 * "Supplier", 13 the Flows list Runs column "17".
 */
export const repeatsPicked =
  repeatsTrim ||
  new URLSearchParams(globalThis.location.search).get("repeats") !== "old";
