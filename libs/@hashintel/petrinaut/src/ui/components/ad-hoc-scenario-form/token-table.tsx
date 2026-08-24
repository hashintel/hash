/**
 * The token spreadsheet under a coloured place, in the same visual grammar as
 * the token spreadsheet elsewhere in the editor: a bordered table with 28px
 * rows, hairline cell delimitations, and a gutter column. The gutter opens a
 * row-kind menu — Fixed (`#n`) / Dynamic count (`i`, blue) / Optimized count
 * (`i`, purple) — and dynamic rows carry a quiet strip above their cells
 * showing `×` and the count (or its bounds). Column headers toggle shared
 * values: sharing paints the column with a subtle wash under the row tints,
 * puts one value slot directly below the header, and renders the cells
 * beneath as dimmed derived copies whose clicks edit the shared value. A
 * phantom trailing row materializes into a fixed row on click, and the
 * place's token total sits at the bottom.
 *
 * The whole table is a keyboard grid. Arrows and Tab move between cells;
 * vertical moves pass through the shared-values line and each dynamic row's
 * count strip, so both are editable without a pointer. The gutter is the
 * left column of the grid: focusing it selects the whole row (highlighted),
 * Enter opens the kind menu, and Delete removes the row. Enter on a cell
 * opens its editor, Escape closes it.
 */

import { use, useRef, useState } from "react";

import { Button, Popover, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  adHocRowKindOf,
  resolveAdHocPlaceTotal,
  setAdHocRowKind,
  shareAdHocColumn,
  unshareAdHocColumn,
  type AdHocColouredPlace,
  type AdHocRow,
  type AdHocRowKind,
  type Color,
  type Place,
} from "@hashintel/petrinaut-core";

import { AdHocFormContext } from "./form-context";
import {
  actionCellStyle,
  cellStyle,
  columnHeaderStyle,
  footerRowStyle,
  gutterCellStyle,
  gutterHeaderStyle,
  phantomCellButtonStyle,
  rowDeleteButtonStyle,
  selectedRowCellStyle,
  tableContainerStyle,
  tableStyle,
} from "./form-table";
import { defaultCellsFor, updateCell, updateRow } from "./state";
import { focusLands, useNavigationZone } from "./use-form-navigation";
import { ValueEditor } from "./value-editor";

// A background image, not a solid color, so it composites over row tints.
const sharedWashStyle = css({
  backgroundImage:
    "[linear-gradient(rgba(120, 120, 130, 0.07), rgba(120, 120, 130, 0.07))]",
});

const dynamicRowStyle = css({
  backgroundColor: "blue.s10",
});

const optimizedRowStyle = css({
  backgroundColor: "purple.s10",
});

const headerButtonStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  height: "[24px]",
  border: "none",
  background: "[transparent]",
  paddingX: "2",
  fontFamily: "mono",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  cursor: "pointer",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  _hover: { color: "neutral.s120", backgroundColor: "neutral.s20" },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
  },
});

const gutterButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[100%]",
  height: "[28px]",
  border: "none",
  background: "[transparent]",
  padding: "[0]",
  fontFamily: "mono",
  fontSize: "[10px]",
  color: "neutral.s80",
  cursor: "pointer",
  _hover: { color: "neutral.s120", backgroundColor: "neutral.s20" },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
  },
});

const dynamicGutterTextStyle = css({
  color: "blue.s100",
  fontStyle: "italic",
});

const optimizedGutterTextStyle = css({
  color: "purple.s100",
  fontStyle: "italic",
});

const stripCellStyle = css({
  borderBottom: "none",
  padding: "[0 8px]",
  height: "[18px]",
});

const stripInnerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  fontFamily: "mono",
  fontSize: "[10px]",
});

const stripMarkStyle = css({
  color: "neutral.s70",
});

const stripEditorStyle = css({
  minHeight: "[16px]",
  height: "[16px]",
  paddingY: "[0]",
  fontSize: "[10px]",
  color: "blue.s110",
  width: "auto",
});

const stripEditorOptimizedStyle = css({
  color: "purple.s110",
  backgroundColor: "[transparent]",
});

const phantomGutterTextStyle = css({
  opacity: "[0.45]",
});

const menuStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "[160px]",
  paddingY: "1",
});

const menuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  border: "none",
  background: "[transparent]",
  paddingX: "2.5",
  paddingY: "1",
  fontSize: "xs",
  color: "neutral.s110",
  cursor: "pointer",
  textAlign: "left",
  outline: "none",
  _hover: { backgroundColor: "neutral.s15" },
  _focus: { backgroundColor: "neutral.s15" },
});

const menuMarkStyle = css({
  width: "[14px]",
  fontFamily: "mono",
  color: "neutral.s80",
});

interface RowKindMenuProps {
  current: AdHocRowKind;
  optimizable: boolean;
  anchor: HTMLButtonElement;
  onSelect: (kind: AdHocRowKind) => void;
  /** The menu went away without a choice (outside interaction). */
  onClose: () => void;
  /** The menu was dismissed from the keyboard: close and refocus the gutter. */
  onDismiss: () => void;
}

/**
 * The row-kind menu, keyboard-first: opening moves focus into the menu onto
 * the checked kind, ArrowUp/ArrowDown cycle the items, Enter chooses, and
 * Escape returns focus to the gutter that opened it.
 */
const RowKindMenu: React.FC<RowKindMenuProps> = ({
  current,
  optimizable,
  anchor,
  onSelect,
  onClose,
  onDismiss,
}) => {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusedOnOpenRef = useRef(false);
  // The Popover focuses this when it opens; the checked item's ref fills it.
  const checkedItemRef = useRef<HTMLElement | null>(null);
  const options: { kind: AdHocRowKind; label: string }[] = [
    { kind: "fixed", label: "Fixed row" },
    { kind: "dynamic", label: "Dynamic count" },
    ...(optimizable
      ? [{ kind: "optimized" as const, label: "Optimized count" }]
      : []),
  ];
  const checkedIndex = Math.max(
    0,
    options.findIndex((option) => option.kind === current),
  );

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null,
    );
    const activeIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    const focusItem = (index: number) => {
      event.preventDefault();
      event.stopPropagation();
      items[(index + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") {
      focusItem(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      focusItem(activeIndex - 1);
    } else if (event.key === "Home") {
      focusItem(0);
    } else if (event.key === "End") {
      focusItem(items.length - 1);
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    }
  };

  return (
    <Popover
      triggerRef={{ current: anchor }}
      position="bottom-start"
      onClose={onClose}
      initialFocusRef={checkedItemRef}
    >
      <Popover.Container>
        <Popover.Body withPadding={false}>
          <div
            className={menuStyle}
            role="menu"
            aria-orientation="vertical"
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
          >
            {options.map((option, index) => (
              <button
                key={option.kind}
                ref={(element) => {
                  itemRefs.current[index] = element;
                  if (index === checkedIndex) {
                    checkedItemRef.current = element;
                    // Focus on first attach too: jsdom never runs the
                    // Popover's own open-autofocus.
                    if (element && !focusedOnOpenRef.current) {
                      focusedOnOpenRef.current = true;
                      element.focus();
                    }
                  }
                }}
                type="button"
                role="menuitemradio"
                aria-checked={current === option.kind}
                tabIndex={index === checkedIndex ? 0 : -1}
                className={menuItemStyle}
                onClick={() => onSelect(option.kind)}
              >
                <span className={menuMarkStyle} aria-hidden="true">
                  {current === option.kind ? "✓" : ""}
                </span>
                {option.label}
              </button>
            ))}
          </div>
        </Popover.Body>
      </Popover.Container>
    </Popover>
  );
};

export interface TokenTableProps {
  place: Place;
  colour: Color;
  state: AdHocColouredPlace;
  onChange: (next: AdHocColouredPlace) => void;
}

export const TokenTable: React.FC<TokenTableProps> = ({
  place,
  colour,
  state,
  onChange,
}) => {
  const { formState, synthesisContext, optimizable } = use(AdHocFormContext);
  const elements = colour.elements;
  const columnCount = elements.length;
  // Nonces, so a repeat click re-triggers the editor's auto-open behaviour.
  const [materializedCell, setMaterializedCell] = useState<{
    row: number;
    column: number;
    nonce: number;
  } | null>(null);
  const [sharedAutoOpen, setSharedAutoOpen] = useState<{
    field: string;
    nonce: number;
  } | null>(null);
  const [kindMenu, setKindMenuState] = useState<{
    row: number;
    anchor: HTMLButtonElement;
  } | null>(null);
  // Gutter focus selects the whole row; the selection highlight follows it.
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const gutterRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const stripRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const sharedRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const headerRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  // The column a vertical move started from, so passing through a full-width
  // stop (a count strip) returns to the same column.
  const lastColumnRef = useRef(0);

  const hasSharedColumns = Object.keys(state.sharedColumns).length > 0;
  const total = resolveAdHocPlaceTotal(formState, synthesisContext, place.id);

  // The table hands focus to the neighbouring form zone past its edges, and
  // receives it at the column headers (top) or the phantom row (bottom).
  const { attach: attachZone, exit: exitZone } = useNavigationZone((edge) =>
    edge === "first"
      ? focusLands(headerRefs.current.get(0))
      : focusLands(cellRefs.current.get(`${state.rows.length}-0`)),
  );

  // Every keyboard-reachable line of the table, top to bottom: the column
  // headers, the shared values, then each row's count strip (dynamic rows)
  // and cells, then the phantom row. Vertical arrows walk this list;
  // horizontal arrows walk a line's own parts (gutter, cells).
  type VerticalStop =
    | { kind: "header" }
    | { kind: "shared" }
    | { kind: "strip"; row: number }
    | { kind: "cells"; row: number }
    | { kind: "phantom" };
  const verticalStops: VerticalStop[] = [
    { kind: "header" },
    ...(hasSharedColumns ? [{ kind: "shared" } as const] : []),
    ...state.rows.flatMap<VerticalStop>((row, index) =>
      row.kind === "template"
        ? [
            { kind: "strip", row: index },
            { kind: "cells", row: index },
          ]
        : [{ kind: "cells", row: index }],
    ),
    { kind: "phantom" },
  ];

  const focusCell = (row: number, column: number) => {
    cellRefs.current.get(`${row}-${column}`)?.focus();
  };

  const focusStop = (index: number, column: number) => {
    const stop = verticalStops[index];
    if (!stop) {
      return;
    }
    switch (stop.kind) {
      case "header":
        headerRefs.current.get(column)?.focus();
        break;
      case "shared": {
        const sharedColumns = elements
          .map((element, columnIndex) =>
            state.sharedColumns[element.name] ? columnIndex : null,
          )
          .filter((columnIndex) => columnIndex !== null);
        const nearest = sharedColumns.reduce((best, candidate) =>
          Math.abs(candidate - column) < Math.abs(best - column)
            ? candidate
            : best,
        );
        sharedRefs.current.get(nearest)?.focus();
        break;
      }
      case "strip":
        stripRefs.current.get(stop.row)?.focus();
        break;
      case "cells":
        focusCell(stop.row, column);
        break;
      case "phantom":
        focusCell(state.rows.length, column);
        break;
    }
  };

  type GridPosition =
    | { kind: "header"; column: number }
    | { kind: "cell"; row: number; column: number }
    | { kind: "phantom"; column: number }
    | { kind: "strip"; row: number }
    | { kind: "shared"; column: number }
    | { kind: "gutter"; row: number };

  const stopIndexOf = (position: GridPosition): number =>
    verticalStops.findIndex((stop) => {
      if (position.kind === "cell" || position.kind === "gutter") {
        return stop.kind === "cells" && stop.row === position.row;
      }
      if (position.kind === "strip") {
        return stop.kind === "strip" && stop.row === position.row;
      }
      if (position.kind === "header") {
        return stop.kind === "header";
      }
      return position.kind === "phantom"
        ? stop.kind === "phantom"
        : stop.kind === "shared";
    });

  const deleteRow = (rowIndex: number) => {
    onChange({
      ...state,
      rows: state.rows.filter((_, index) => index !== rowIndex),
    });
    // Focus the same gutter position after React commits the removal; the
    // phantom row's first cell when the last row went.
    const remaining = state.rows.length - 1;
    setTimeout(() => {
      if (remaining > 0) {
        gutterRefs.current.get(Math.min(rowIndex, remaining - 1))?.focus();
      } else {
        focusCell(0, 0);
      }
    }, 0);
  };

  const handleGridKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    position: GridPosition,
  ) => {
    const stopIndex = stopIndexOf(position);
    const column =
      position.kind === "strip" || position.kind === "gutter"
        ? lastColumnRef.current
        : position.column;
    if (position.kind === "cell" || position.kind === "phantom") {
      lastColumnRef.current = position.column;
    }
    const handled = (action: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    };

    // Gutter: vertical moves stay in the gutter, right enters the cells, and
    // Delete removes the selected row.
    if (position.kind === "gutter") {
      if (event.key === "ArrowRight") {
        handled(() => focusCell(position.row, 0));
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        const nextRow = position.row + step;
        if (nextRow >= 0 && nextRow < state.rows.length) {
          handled(() => gutterRefs.current.get(nextRow)?.focus());
        } else {
          handled(() => exitZone(step === 1 ? "next" : "previous"));
        }
      } else if (event.key === "Delete" || event.key === "Backspace") {
        handled(() => deleteRow(position.row));
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const nextIndex = stopIndex + (event.key === "ArrowDown" ? 1 : -1);
      if (nextIndex >= 0 && nextIndex < verticalStops.length) {
        handled(() => focusStop(nextIndex, column));
      } else {
        handled(() =>
          exitZone(event.key === "ArrowDown" ? "next" : "previous"),
        );
      }
      return;
    }

    if (position.kind === "header") {
      if (event.key === "ArrowRight" && position.column < columnCount - 1) {
        handled(() => headerRefs.current.get(position.column + 1)?.focus());
      } else if (event.key === "ArrowLeft" && position.column > 0) {
        handled(() => headerRefs.current.get(position.column - 1)?.focus());
      }
      return;
    }

    if (position.kind === "strip") {
      return;
    }

    if (position.kind === "shared") {
      const sharedColumns = elements
        .map((element, columnIndex) =>
          state.sharedColumns[element.name] ? columnIndex : null,
        )
        .filter((columnIndex) => columnIndex !== null);
      const at = sharedColumns.indexOf(position.column);
      if (event.key === "ArrowRight" && at < sharedColumns.length - 1) {
        handled(() => sharedRefs.current.get(sharedColumns[at + 1]!)?.focus());
      } else if (event.key === "ArrowLeft" && at > 0) {
        handled(() => sharedRefs.current.get(sharedColumns[at - 1]!)?.focus());
      }
      return;
    }

    // Cells and the phantom row.
    const row = position.kind === "cell" ? position.row : state.rows.length;
    if (event.key === "ArrowRight" && position.column < columnCount - 1) {
      handled(() => focusCell(row, position.column + 1));
    } else if (event.key === "ArrowLeft") {
      if (position.column > 0) {
        handled(() => focusCell(row, position.column - 1));
      } else if (position.kind === "cell") {
        handled(() => gutterRefs.current.get(position.row)?.focus());
      }
    } else if (event.key === "Tab") {
      if (event.shiftKey) {
        if (position.column > 0) {
          handled(() => focusCell(row, position.column - 1));
        } else if (stopIndex > 0) {
          handled(() => focusStop(stopIndex - 1, columnCount - 1));
        }
      } else if (position.column < columnCount - 1) {
        handled(() => focusCell(row, position.column + 1));
      } else if (stopIndex < verticalStops.length - 1) {
        handled(() => focusStop(stopIndex + 1, 0));
      }
    }
    // Enter falls through: the cell's own click/open handling owns it.
  };

  const openSharedEditor = (field: string) => {
    setSharedAutoOpen((previous) => ({
      field,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  };

  const materializeRow = (column: number) => {
    const rowIndex = state.rows.length;
    onChange({
      ...state,
      rows: [
        ...state.rows,
        { kind: "fixed", cells: defaultCellsFor(elements) },
      ],
    });
    // A shared column's cells are derived, so the fresh cell cannot be
    // edited; its editor is the shared value's.
    const field = elements[column]?.name;
    if (field && state.sharedColumns[field]) {
      openSharedEditor(field);
      return;
    }
    setMaterializedCell((previous) => ({
      row: rowIndex,
      column,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  };

  const setRowKind = (rowIndex: number, kind: AdHocRowKind) => {
    onChange(
      updateRow(state, rowIndex, (current) => setAdHocRowKind(current, kind)),
    );
    const anchor = kindMenu?.anchor;
    setKindMenuState(null);
    anchor?.focus();
  };

  const renderDataRow = (row: AdHocRow, rowIndex: number) => {
    const kind = adHocRowKindOf(row);
    const isDynamic = row.kind === "template";
    const selected =
      (selectedRow === rowIndex || kindMenu?.row === rowIndex) &&
      selectedRowCellStyle;
    const tint =
      kind === "optimized"
        ? optimizedRowStyle
        : kind === "dynamic"
          ? dynamicRowStyle
          : false;
    const countTarget = {
      kind: "count" as const,
      placeId: place.id,
      row: rowIndex,
    };

    return (
      <tbody key={rowIndex}>
        {isDynamic ? (
          <tr>
            <td
              className={cx(gutterCellStyle, stripCellStyle, tint, selected)}
            />
            <td
              colSpan={columnCount}
              className={cx(cellStyle, stripCellStyle, tint, selected)}
            >
              <div className={stripInnerStyle}>
                <span className={stripMarkStyle}>×</span>
                <ValueEditor
                  value={row.count}
                  target={countTarget}
                  integer
                  withStep={false}
                  placeholder="1"
                  className={cx(
                    stripEditorStyle,
                    kind === "optimized" && stripEditorOptimizedStyle,
                  )}
                  triggerRef={(element) => {
                    if (element) {
                      stripRefs.current.set(rowIndex, element);
                    } else {
                      stripRefs.current.delete(rowIndex);
                    }
                  }}
                  onTriggerKeyDown={(event) =>
                    handleGridKeyDown(event, { kind: "strip", row: rowIndex })
                  }
                  onChange={(count) =>
                    onChange(
                      updateRow(state, rowIndex, (current) =>
                        current.kind === "template"
                          ? { ...current, count }
                          : current,
                      ),
                    )
                  }
                />
              </div>
            </td>
            <td
              className={cx(actionCellStyle, stripCellStyle, tint, selected)}
            />
          </tr>
        ) : null}
        <tr>
          <td className={cx(gutterCellStyle, tint, selected)}>
            <Tooltip
              content={
                kind === "fixed"
                  ? `Row ${
                      rowIndex + 1
                    } — one token. Enter chooses the row's kind, Delete removes it.`
                  : `Row ${rowIndex + 1} — dynamic${
                      kind === "optimized" ? ", count optimized" : ""
                    }. Enter chooses the row's kind, Delete removes it.`
              }
            >
              <button
                ref={(element) => {
                  if (element) {
                    gutterRefs.current.set(rowIndex, element);
                  } else {
                    gutterRefs.current.delete(rowIndex);
                  }
                }}
                type="button"
                className={gutterButtonStyle}
                aria-label={`Row ${rowIndex + 1} kind`}
                aria-haspopup="menu"
                aria-expanded={kindMenu?.row === rowIndex}
                onFocus={() => setSelectedRow(rowIndex)}
                onBlur={() => setSelectedRow(null)}
                onKeyDown={(event) =>
                  handleGridKeyDown(event, { kind: "gutter", row: rowIndex })
                }
                onClick={(event) =>
                  setKindMenuState({
                    row: rowIndex,
                    anchor: event.currentTarget,
                  })
                }
              >
                <span
                  className={cx(
                    kind === "dynamic" && dynamicGutterTextStyle,
                    kind === "optimized" && optimizedGutterTextStyle,
                  )}
                >
                  {isDynamic ? "i" : `#${rowIndex + 1}`}
                </span>
              </button>
            </Tooltip>
            {kindMenu?.row === rowIndex ? (
              <RowKindMenu
                current={kind}
                optimizable={optimizable}
                anchor={kindMenu.anchor}
                onSelect={(nextKind) => setRowKind(rowIndex, nextKind)}
                onClose={() => setKindMenuState(null)}
                onDismiss={() => {
                  const menuAnchor = kindMenu.anchor;
                  setKindMenuState(null);
                  // After the Popover teardown settles - Zag's own Escape
                  // handling races this and would blur to the body.
                  setTimeout(() => menuAnchor.focus(), 0);
                }}
              />
            ) : null}
          </td>
          {elements.map((element, columnIndex) => {
            const shared = state.sharedColumns[element.name];
            const cell = row.cells[columnIndex] ?? {
              expression: "",
              optimize: null,
            };
            const target = {
              kind: "cell" as const,
              placeId: place.id,
              row: rowIndex,
              column: columnIndex,
            };
            const autoOpen =
              materializedCell !== null &&
              materializedCell.row === rowIndex &&
              materializedCell.column === columnIndex
                ? materializedCell.nonce
                : 0;
            return (
              <td
                key={element.elementId}
                className={cx(
                  cellStyle,
                  tint,
                  shared && sharedWashStyle,
                  selected,
                )}
              >
                <ValueEditor
                  value={shared ?? cell}
                  // A derived cell joins to its column's slot: the shared
                  // value's label, diagnostics, and errors surface here.
                  target={
                    shared
                      ? {
                          kind: "column",
                          placeId: place.id,
                          column: columnIndex,
                        }
                      : target
                  }
                  integer={element.type === "integer"}
                  booleanDomain={element.type === "boolean"}
                  derived={Boolean(shared)}
                  autoOpen={autoOpen}
                  onOpenDerived={() => openSharedEditor(element.name)}
                  triggerRef={(el) => {
                    if (el) {
                      cellRefs.current.set(`${rowIndex}-${columnIndex}`, el);
                    } else {
                      cellRefs.current.delete(`${rowIndex}-${columnIndex}`);
                    }
                  }}
                  onTriggerKeyDown={(event) =>
                    handleGridKeyDown(event, {
                      kind: "cell",
                      row: rowIndex,
                      column: columnIndex,
                    })
                  }
                  onChange={(next) =>
                    onChange(
                      updateCell(state, rowIndex, columnIndex, () => next),
                    )
                  }
                />
              </td>
            );
          })}
          <td className={cx(actionCellStyle, tint, selected)}>
            <Button
              size="xs"
              variant="ghost"
              tone="neutral"
              aria-label={`Remove row ${rowIndex + 1}`}
              iconName="trash"
              className={rowDeleteButtonStyle}
              onClick={() => deleteRow(rowIndex)}
            />
          </td>
        </tr>
      </tbody>
    );
  };

  return (
    <div ref={attachZone} className={tableContainerStyle}>
      <table className={tableStyle}>
        <thead>
          <tr>
            <th aria-label="Row kind" className={gutterHeaderStyle} />
            {elements.map((element, columnIndex) => {
              const shared = Boolean(state.sharedColumns[element.name]);
              return (
                <th
                  key={element.elementId}
                  className={cx(columnHeaderStyle, shared && sharedWashStyle)}
                >
                  <Tooltip
                    content={
                      shared
                        ? "Shared value — click to release the column"
                        : "Click to share one value across the column"
                    }
                  >
                    <button
                      ref={(el) => {
                        if (el) {
                          headerRefs.current.set(columnIndex, el);
                        } else {
                          headerRefs.current.delete(columnIndex);
                        }
                      }}
                      type="button"
                      className={headerButtonStyle}
                      aria-label={`Share column ${element.name}`}
                      aria-pressed={shared}
                      onKeyDown={(event) =>
                        handleGridKeyDown(event, {
                          kind: "header",
                          column: columnIndex,
                        })
                      }
                      onClick={() =>
                        onChange(
                          shared
                            ? unshareAdHocColumn(state, element.name)
                            : shareAdHocColumn(
                                state,
                                element.name,
                                columnIndex,
                              ),
                        )
                      }
                    >
                      {element.name}
                    </button>
                  </Tooltip>
                </th>
              );
            })}
            <th aria-label="Row actions" className={gutterHeaderStyle} />
          </tr>
        </thead>

        {/* Shared values: one slot directly below each shared header. */}
        {hasSharedColumns ? (
          <tbody>
            <tr>
              <td className={gutterCellStyle} />
              {elements.map((element, columnIndex) => {
                const shared = state.sharedColumns[element.name];
                if (!shared) {
                  return <td key={element.elementId} className={cellStyle} />;
                }
                const target = {
                  kind: "column" as const,
                  placeId: place.id,
                  column: columnIndex,
                };
                return (
                  <td
                    key={element.elementId}
                    className={cx(cellStyle, sharedWashStyle)}
                  >
                    <ValueEditor
                      value={shared}
                      target={target}
                      integer={element.type === "integer"}
                      booleanDomain={element.type === "boolean"}
                      autoOpen={
                        sharedAutoOpen?.field === element.name
                          ? sharedAutoOpen.nonce
                          : 0
                      }
                      triggerRef={(el) => {
                        if (el) {
                          sharedRefs.current.set(columnIndex, el);
                        } else {
                          sharedRefs.current.delete(columnIndex);
                        }
                      }}
                      onTriggerKeyDown={(event) =>
                        handleGridKeyDown(event, {
                          kind: "shared",
                          column: columnIndex,
                        })
                      }
                      onChange={(next) =>
                        onChange({
                          ...state,
                          sharedColumns: {
                            ...state.sharedColumns,
                            [element.name]: next,
                          },
                        })
                      }
                    />
                  </td>
                );
              })}
              <td className={actionCellStyle} />
            </tr>
          </tbody>
        ) : null}

        {state.rows.map((row, rowIndex) => renderDataRow(row, rowIndex))}

        {/* Phantom trailing row: materializes on click. */}
        <tbody>
          <tr>
            <td className={gutterCellStyle}>
              <span className={phantomGutterTextStyle}>
                #{state.rows.length + 1}
              </span>
            </td>
            {elements.map((element, columnIndex) => (
              <td
                key={element.elementId}
                className={cx(
                  cellStyle,
                  state.sharedColumns[element.name] && sharedWashStyle,
                )}
              >
                <button
                  ref={(el) => {
                    const key = `${state.rows.length}-${columnIndex}`;
                    if (el) {
                      cellRefs.current.set(key, el);
                    } else {
                      cellRefs.current.delete(key);
                    }
                  }}
                  type="button"
                  className={phantomCellButtonStyle}
                  aria-label={`Add a token row (${element.name})`}
                  onClick={() => materializeRow(columnIndex)}
                  onKeyDown={(event) =>
                    handleGridKeyDown(event, {
                      kind: "phantom",
                      column: columnIndex,
                    })
                  }
                />
              </td>
            ))}
            <td className={actionCellStyle} />
          </tr>
        </tbody>

        <tfoot>
          <tr>
            <td colSpan={columnCount + 2} className={footerRowStyle}>
              {total.resolved
                ? `= ${total.total} tokens`
                : `= ${total.text} tokens`}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
