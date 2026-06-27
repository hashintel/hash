import { css } from "@hashintel/ds-helpers/css";

import type { SortKey, SortDir } from "./row-types";

const headerButton = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
  transition: "colors",
  cursor: "pointer",
  _hover: { color: "fg.heading" },
});
const caret = css({ flexShrink: 0 });

/** Clickable column header that toggles sort key/direction and shows a caret. */
export const SortHeader = ({
  label,
  sortKey,
  current,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onToggle: (key: SortKey) => void;
}) => {
  const active = current.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={headerButton}
    >
      {label}
      {active && (
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          className={caret}
          aria-hidden="true"
        >
          {current.dir === "desc" ? (
            <path
              d="M1.5 3L4 5.5L6.5 3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M1.5 5.5L4 3L6.5 5.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          )}
        </svg>
      )}
    </button>
  );
};
