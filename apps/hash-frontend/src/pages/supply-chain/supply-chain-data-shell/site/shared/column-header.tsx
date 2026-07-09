import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { FilterMenu, type ColumnFilter } from "./filter-menu";

import type { SortDir } from "./row-types";

export interface ColumnSort {
  active: boolean;
  dir: SortDir;
  onToggle: () => void;
}

const wrap = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
});

const sortButton = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
  transition: "colors",
  cursor: "pointer",
  _hover: { color: "fg.heading" },
});

const sortArrow = css({
  display: "inline-flex",
  flexShrink: 0,
  transition: "[transform 160ms ease]",
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});

/**
 * Shared table column header for the site overview tables:
 * renders the label (clickable when sortable, with a direction caret)
 * plus an optional searchable filter menu.
 */
export const ColumnHeader = ({
  label,
  sort,
  filter,
}: {
  label: string;
  sort?: ColumnSort;
  filter?: ColumnFilter;
}) => {
  const sortStateLabel = sort?.active
    ? `, sorted ${sort.dir === "asc" ? "ascending" : "descending"}`
    : "";

  return (
    <span className={wrap}>
      {sort ? (
        <button
          type="button"
          onClick={sort.onToggle}
          className={sortButton}
          aria-label={`Sort by ${label}${sortStateLabel}`}
        >
          {label}
          {sort.active && (
            <span
              className={sortArrow}
              style={{
                transform:
                  sort.dir === "asc" ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              <Icon name="arrowDown" size="xs" />
            </span>
          )}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {filter && <FilterMenu {...filter} />}
    </span>
  );
};
