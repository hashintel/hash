import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { SortDir } from "./row-types";

export interface ColumnSort {
  active: boolean;
  dir: SortDir;
  /** Direction a click applies while this column is not the active sort. */
  defaultDir?: SortDir;
  onToggle: () => void;
}

const wrap = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
});

// The hover zone is the whole header cell, not just the label text: the
// caret reveal and label highlight both key off `th:hover`.
const sortButton = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
  transition: "colors",
  cursor: "pointer",
  "th:hover &": { color: "fg.heading" },
  _focusVisible: { color: "fg.heading" },
});

// The direction caret rests hidden; hovering the header cell (or keyboard
// focus on the header button) reveals it.
const sortArrow = css({
  display: "inline-flex",
  flexShrink: 0,
  opacity: "0",
  transition: "[transform 160ms ease, opacity 120ms ease]",
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  "th:hover &": { opacity: "1" },
  "button:focus-visible &": { opacity: "1" },
});

/**
 * Shared table column header for the site overview tables: renders the label,
 * clickable when sortable, with a direction caret. Filtering lives in the
 * shared filter bar above each table (see supply-chain-filter-bar.tsx).
 *
 * The caret is always in layout (revealed on cell hover) so the label never
 * shifts; while the column is unsorted it previews the direction a click
 * would apply. `align="right"` puts it on the label's outer (left) side so a
 * right-aligned label stays flush with the cell edge.
 */
export const ColumnHeader = ({
  label,
  sort,
  align = "left",
}: {
  label: string;
  sort?: ColumnSort;
  align?: "left" | "right";
}) => {
  const sortStateLabel = sort?.active
    ? `, sorted ${sort.dir === "asc" ? "ascending" : "descending"}`
    : "";
  const shownDir = sort?.active ? sort.dir : (sort?.defaultDir ?? "desc");
  const caret = sort ? (
    <span
      className={sortArrow}
      style={{
        transform: shownDir === "asc" ? "rotate(180deg)" : "rotate(0deg)",
      }}
    >
      <Icon name="arrowDown" size="xs" />
    </span>
  ) : null;

  return (
    <span className={wrap}>
      {sort ? (
        <button
          type="button"
          onClick={sort.onToggle}
          className={sortButton}
          aria-label={`Sort by ${label}${sortStateLabel}`}
        >
          {align === "right" && caret}
          {label}
          {align === "left" && caret}
        </button>
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
};
