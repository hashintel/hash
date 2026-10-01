import { css } from "@hashintel/ds-helpers/css";

import type { SortKey, SortDir } from "./row-types";

// The hover zone is the whole header cell, not just the label text: the
// caret reveal and label highlight both key off `th:hover`.
const headerButton = css({
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
const caret = css({
  flexShrink: 0,
  opacity: "0",
  transition: "[opacity 120ms ease]",
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  "th:hover &": { opacity: "1" },
  "button:focus-visible &": { opacity: "1" },
});

/**
 * Clickable column header that toggles sort key/direction and shows a caret.
 *
 * The caret is always in layout (revealed on cell hover) so the label never
 * shifts; while the column is unsorted it previews `defaultDir`, the
 * direction a click would apply. `align="right"` puts it on the label's
 * outer (left) side so a right-aligned label stays flush with the cell edge.
 */
export const SortHeader = ({
  label,
  sortKey,
  current,
  onToggle,
  align = "left",
  defaultDir = "desc",
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onToggle: (key: SortKey) => void;
  align?: "left" | "right";
  defaultDir?: SortDir;
}) => {
  const active = current.key === sortKey;
  const shownDir = active ? current.dir : defaultDir;
  const caretSvg = (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      className={caret}
      aria-hidden="true"
    >
      {shownDir === "desc" ? (
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
  );
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={headerButton}
    >
      {align === "right" && caretSvg}
      {label}
      {align === "left" && caretSvg}
    </button>
  );
};
