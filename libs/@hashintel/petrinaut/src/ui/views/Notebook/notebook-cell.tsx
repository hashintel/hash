import { Fragment, memo } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import {
  ChevronRightIcon,
  useExperimentalIconPackEnabled,
} from "../../experimental-icons";
import { CELL_KIND_ICONS, CELL_KIND_LABELS } from "./cell-kinds";

import type { CellRef, NotebookCellKind } from "./notebook-model";

const cellStyle = cva({
  base: {
    borderBottomWidth: "[1px]",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.s30",
    borderRadius: "sm",
    transition: "[background-color 100ms ease-out, opacity 100ms ease-out]",
  },
  variants: {
    isSelected: {
      true: { backgroundColor: "blue.s20" },
      false: {
        _hover: { backgroundColor: "neutral.bg.surface.hover" },
      },
    },
    isDimmed: {
      true: { opacity: "[0.4]" },
      false: {},
    },
  },
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  minHeight: "8",
  paddingX: "1",
  cursor: "pointer",
  userSelect: "none",
});

const caretButtonStyle = cva({
  base: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "4",
    height: "6",
    padding: "[0]",
    backgroundColor: "[transparent]",
    borderWidth: "[0]",
    color: "neutral.s80",
    cursor: "pointer",
    transition: "[transform 150ms ease-out]",
    _hover: { color: "neutral.s115" },
  },
  variants: {
    expanded: {
      true: { transform: "rotate(90deg)" },
      false: { transform: "rotate(0deg)" },
    },
  },
});

const iconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const kindStyle = css({
  flexShrink: 0,
  fontSize: "xs",
  fontFamily: "mono",
  fontWeight: "medium",
  color: "purple.s100",
  whiteSpace: "nowrap",
});

const nameStyle = css({
  flexShrink: 0,
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s115",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "[40%]",
});

const nameMarkStyle = css({
  backgroundColor: "yellow.s40",
  color: "[inherit]",
  borderRadius: "xs",
});

const countStyle = css({
  flexShrink: 0,
  fontSize: "[10px]",
  fontFamily: "mono",
  color: "neutral.s90",
  cursor: "default",
  paddingLeft: "1",
});

const summaryStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  fontSize: "xs",
  color: "neutral.fg.subtle",
  fontFamily: "mono",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingLeft: "7",
  paddingRight: "2",
  paddingBottom: "3",
});

const HighlightedName: React.FC<{
  name: string;
  matchIndices: number[] | null;
}> = ({ name, matchIndices }) => {
  if (matchIndices === null || matchIndices.length === 0) {
    return name;
  }
  const matched = new Set(matchIndices);

  const segments: { start: number; text: string; isMatch: boolean }[] = [];
  let runStart = 0;
  for (let index = 1; index <= name.length; index++) {
    if (index === name.length || matched.has(index) !== matched.has(runStart)) {
      segments.push({
        start: runStart,
        text: name.slice(runStart, index),
        isMatch: matched.has(runStart),
      });
      runStart = index;
    }
  }

  return segments.map((segment) =>
    segment.isMatch ? (
      <mark key={segment.start} className={nameMarkStyle}>
        {segment.text}
      </mark>
    ) : (
      <Fragment key={segment.start}>{segment.text}</Fragment>
    ),
  );
};

const CELL_ICON_SIZE = 12;

/** What a row asks of its list. A row reads it in its event handlers only. */
export type CellRowActions = {
  select: (cell: CellRef) => void;
  setExpanded: (cellId: string, expanded: boolean) => void;
  /** Reports row focus, keeping selection and the roving stop in step. */
  focusRow: (cell: CellRef) => void;
  /** Vertical arrow navigation — the keys the row doesn't own itself. */
  navigate: (cellId: string, event: React.KeyboardEvent) => void;
  focusSearch: () => void;
};

interface NotebookCellProps {
  cellId: string;
  kind: NotebookCellKind;
  iconColor: string | undefined;
  name: string;
  summary: string;
  isSelected: boolean;
  isExpanded: boolean;
  /** Row is faded because a search is active and this cell doesn't match. */
  isDimmed: boolean;
  /** Matched character indices in the name while searching, or null. */
  nameMatchIndices: number[] | null;
  /** How much depends on this cell, shown at the end of the row. */
  directDependents: number;
  transitiveDependents: number;
  /** 0 for the list's one tabbable row, -1 for the rest (roving tab stop). */
  tabIndex: 0 | -1;
  actionsRef: React.RefObject<CellRowActions>;
  /** The body, while the cell is open. */
  children: React.ReactNode;
}

const Cell: React.FC<NotebookCellProps> = ({
  cellId,
  kind,
  iconColor,
  name,
  summary,
  isSelected,
  isExpanded,
  isDimmed,
  nameMatchIndices,
  directDependents,
  transitiveDependents,
  tabIndex,
  actionsRef,
  children,
}) => {
  const experimentalIcons = useExperimentalIconPackEnabled();
  const KindIcon = CELL_KIND_ICONS[kind];
  const kindLabel = CELL_KIND_LABELS[kind];

  return (
    <div data-cell-id={cellId} className={cellStyle({ isSelected, isDimmed })}>
      <div
        data-cell-row={cellId}
        className={rowStyle}
        role="button"
        tabIndex={tabIndex}
        onClick={() => actionsRef.current.select({ id: cellId, kind })}
        onFocus={(event) => {
          // Only the row itself: focus events bubble from the caret button.
          if (event.target === event.currentTarget) {
            actionsRef.current.focusRow({ id: cellId, kind });
          }
        }}
        onKeyDown={(event) => {
          if (
            (event.key === "Enter" || event.key === " ") &&
            event.target === event.currentTarget
          ) {
            event.preventDefault();
            actionsRef.current.select({ id: cellId, kind });
          } else if (event.key === "ArrowRight") {
            // The row owns the horizontal arrows for expand/collapse, so it
            // never emits horizontal moves into the worksheet flow.
            event.preventDefault();
            actionsRef.current.setExpanded(cellId, true);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            actionsRef.current.setExpanded(cellId, false);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            actionsRef.current.navigate(cellId, event);
          } else if (event.key === "/") {
            event.preventDefault();
            actionsRef.current.focusSearch();
          }
        }}
      >
        <button
          type="button"
          aria-label={isExpanded ? "Collapse cell" : "Expand cell"}
          aria-expanded={isExpanded}
          tabIndex={-1}
          className={caretButtonStyle({ expanded: isExpanded })}
          onClick={(event) => {
            event.stopPropagation();
            actionsRef.current.setExpanded(cellId, !isExpanded);
          }}
        >
          {experimentalIcons ? (
            <ChevronRightIcon size={8} hover="none" />
          ) : (
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
              <path d="M2 0 L7 4 L2 8 Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span
          className={iconStyle}
          style={iconColor === undefined ? undefined : { color: iconColor }}
        >
          <KindIcon size={CELL_ICON_SIZE} />
        </span>
        <span className={kindStyle}>{kindLabel}</span>
        <span className={nameStyle}>
          <HighlightedName name={name} matchIndices={nameMatchIndices} />
        </span>
        <span className={summaryStyle}>{summary}</span>
        {transitiveDependents > 0 && (
          <span
            className={countStyle}
            title={`${directDependents} direct dependent${directDependents === 1 ? "" : "s"}, ${transitiveDependents} in total`}
          >
            {directDependents} → {transitiveDependents}
          </span>
        )}
      </div>
      {isExpanded && <div className={bodyStyle}>{children}</div>}
    </div>
  );
};

// Under `memo`: the compiler does not memoize an element made in a loop, so a
// cell skips a render of its list only through its own props.
export const NotebookCell = memo(Cell);
