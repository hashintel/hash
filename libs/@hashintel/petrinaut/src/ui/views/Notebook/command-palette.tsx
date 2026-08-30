import { useState } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { CELL_KIND_ICONS, CELL_KIND_LABELS } from "./cell-kinds";
import { HighlightedName } from "./notebook-cell";
import { cellName, fuzzyMatchName } from "./notebook-model";

import type { NotebookCell as NotebookCellModel } from "./notebook-model";

/** A view command the palette can run, beside the jumpable cells. */
export type PaletteAction = {
  id: string;
  label: string;
  /** Right-aligned state or shortcut hint. */
  hint?: string;
  run: () => void;
};

const backdropStyle = css({
  position: "fixed",
  inset: "[0]",
  zIndex: "modal",
  backgroundColor: "[rgba(15, 18, 24, 0.25)]",
});

const panelStyle = css({
  position: "fixed",
  top: "[14%]",
  left: "[50%]",
  transform: "translateX(-50%)",
  width: "[min(600px, calc(100vw - 48px))]",
  zIndex: "modal",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.s00",
  borderRadius: "lg",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  boxShadow:
    "[0px 12px 32px -8px rgba(0,0,0,0.25), 0px 2px 8px rgba(0,0,0,0.1)]",
  overflow: "hidden",
});

const inputStyle = css({
  width: "full",
  paddingX: "3",
  paddingY: "2.5",
  fontSize: "sm",
  color: "neutral.s115",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s30",
  outline: "[none]",
});

const listStyle = css({
  maxHeight: "[340px]",
  overflowY: "auto",
  paddingY: "1",
});

const entryStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    width: "full",
    paddingX: "3",
    paddingY: "1.5",
    fontSize: "sm",
    textAlign: "left",
    backgroundColor: "[transparent]",
    borderWidth: "[0]",
    cursor: "pointer",
    color: "neutral.s115",
  },
  variants: {
    isSelected: {
      true: { backgroundColor: "blue.s20" },
      false: {},
    },
  },
});

const entryKindStyle = css({
  flexShrink: 0,
  fontSize: "xs",
  fontFamily: "mono",
  color: "purple.s100",
  width: "[76px]",
});

const entryHintStyle = css({
  marginLeft: "auto",
  flexShrink: 0,
  fontSize: "xs",
  color: "neutral.fg.subtle",
});

const emptyStyle = css({
  paddingX: "3",
  paddingY: "3",
  fontSize: "sm",
  color: "neutral.fg.subtle",
});

type PaletteEntry =
  | { kind: "action"; action: PaletteAction; indices: number[] }
  | { kind: "cell"; cell: NotebookCellModel; indices: number[] };

const MAX_LISTED_CELLS = 40;

export interface CommandPaletteProps {
  /** Every cell, unfiltered — jumping reveals a hidden kind. */
  cells: NotebookCellModel[];
  actions: PaletteAction[];
  onJumpToCell: (cellId: string) => void;
  onClose: () => void;
}

/**
 * The ⌘K palette: one keyboard-first surface that fuzzy-matches the view's
 * commands and every cell name. Actions list first, cells after; Enter runs
 * the selection, Escape closes. Modelled on the Linear/VS Code palettes.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  cells,
  actions,
  onJumpToCell,
  onClose,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const trimmed = query.trim();
  const entries: PaletteEntry[] = [
    ...actions.flatMap((action): PaletteEntry[] => {
      const indices =
        trimmed === "" ? [] : fuzzyMatchName(trimmed, action.label);
      return indices === null ? [] : [{ kind: "action", action, indices }];
    }),
    ...cells.flatMap((cell): PaletteEntry[] => {
      const indices =
        trimmed === "" ? [] : fuzzyMatchName(trimmed, cellName(cell));
      return indices === null ? [] : [{ kind: "cell", cell, indices }];
    }),
  ].slice(0, actions.length + MAX_LISTED_CELLS);

  const clampedIndex = Math.min(selectedIndex, entries.length - 1);

  const runEntry = (entry: PaletteEntry) => {
    if (entry.kind === "action") {
      entry.action.run();
    } else {
      onJumpToCell(entry.cell.id);
    }
    onClose();
  };

  return (
    <>
      <div className={backdropStyle} onClick={onClose} aria-hidden />
      <div className={panelStyle} role="dialog" aria-label="Command palette">
        <input
          // The palette exists for exactly this: focus lands in it on open.
          ref={(element) => element?.focus()}
          className={inputStyle}
          placeholder="Jump to a cell or run a command…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelectedIndex(Math.min(clampedIndex + 1, entries.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelectedIndex(Math.max(clampedIndex - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const entry = entries[clampedIndex];
              if (entry) {
                runEntry(entry);
              }
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
        />
        <div className={listStyle} role="listbox" aria-label="Palette results">
          {entries.length === 0 ? (
            <div className={emptyStyle}>Nothing matches "{trimmed}".</div>
          ) : (
            entries.map((entry, at) => {
              const isSelected = at === clampedIndex;
              if (entry.kind === "action") {
                return (
                  <button
                    key={`action-${entry.action.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={entryStyle({ isSelected })}
                    onMouseEnter={() => setSelectedIndex(at)}
                    onClick={() => runEntry(entry)}
                  >
                    <span className={entryKindStyle}>command</span>
                    <HighlightedName
                      name={entry.action.label}
                      matchIndices={entry.indices}
                    />
                    {entry.action.hint !== undefined && (
                      <span className={entryHintStyle}>
                        {entry.action.hint}
                      </span>
                    )}
                  </button>
                );
              }
              const KindIcon = CELL_KIND_ICONS[entry.cell.kind];
              return (
                <button
                  key={`cell-${entry.cell.id}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={entryStyle({ isSelected })}
                  onMouseEnter={() => setSelectedIndex(at)}
                  onClick={() => runEntry(entry)}
                >
                  <span className={entryKindStyle}>
                    {CELL_KIND_LABELS[entry.cell.kind]}
                  </span>
                  <KindIcon size={11} />
                  <HighlightedName
                    name={cellName(entry.cell)}
                    matchIndices={entry.indices}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
