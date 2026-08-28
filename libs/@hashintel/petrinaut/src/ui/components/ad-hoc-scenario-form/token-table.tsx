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
 * phantom trailing row follows the cell selection model — the first click
 * selects, the second (or Enter, or the gutter's +) materializes a fixed
 * row — and the place's token total sits at the bottom.
 *
 * The whole table is a keyboard grid. Arrows and Tab move between cells;
 * vertical moves pass through the shared-values line and each dynamic row's
 * count strip, so both are editable without a pointer. The gutter is the
 * left column of the grid: focusing it selects the whole row (highlighted),
 * Enter opens the kind menu, and Delete removes the row. Enter on a cell
 * opens its editor, Escape closes it.
 */

import { use, useRef, useState } from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  adHocRowKindOf,
  resolveAdHocPlaceTotal,
  type AdHocColouredPlace,
  type AdHocRow,
  type AdHocRowKind,
  type Color,
  type Place,
} from "@hashintel/petrinaut-core";

import { AdHocFormContext } from "./form-context";
import {
  focusLands,
  useNavigationZone,
} from "./navigation/use-form-navigation";
import { FormSpreadsheet } from "./spreadsheet/form-spreadsheet";
import {
  cellStyle,
  columnHeaderStyle,
  gutterCellStyle,
  gutterHeaderStyle,
  phantomCellButtonStyle,
  phantomRowCellStyle,
  selectedRowCellStyle,
} from "./spreadsheet/form-table";
import { GutterCell } from "./spreadsheet/gutter-cell";
import { PhantomLine } from "./spreadsheet/phantom-line";
import { useRowSelection } from "./spreadsheet/use-row-selection";
import { useSelectFirstActivation } from "./spreadsheet/use-select-first";
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
  height: "[20px!]",
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
  minHeight: "[16px!]",
  height: "[16px!]",
  paddingY: "[0]",
  fontSize: "[10px]",
  color: "blue.s110",
  width: "auto",
});

const stripEditorOptimizedStyle = css({
  color: "purple.s110",
  backgroundColor: "[transparent]",
});

// The place total sits under the spreadsheet, outside it — one tight line,
// so it doesn't widen the gap to the next place block.
const totalTextStyle = css({
  textAlign: "right",
  fontFamily: "mono",
  fontSize: "[10px]",
  lineHeight: "[1.2]",
  color: "neutral.s80",
  paddingX: "1",
  marginTop: "[1px]",
});

export interface TokenTableProps {
  place: Place;
  colour: Color;
  state: AdHocColouredPlace;
}

export const TokenTable: React.FC<TokenTableProps> = ({
  place,
  colour,
  state,
}) => {
  const { formState, synthesisContext, selection, setFocusedValue, dispatch } =
    use(AdHocFormContext);
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
  // Gutter focus selects the whole row; the selection highlight follows it.
  const rowSelection = useRowSelection();
  // Phantom cells select on the first click and materialize on the second.
  const phantomActivation = useSelectFirstActivation();
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
        // Stale sharedColumns keys (a renamed colour element) can leave no
        // matching column: a focus no-op, not a reduce over an empty array.
        if (sharedColumns.length === 0) {
          break;
        }
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
    dispatch({ type: "deleteTokenRow", placeId: place.id, row: rowIndex });
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

    // Gutter: vertical moves stay in the gutter, right enters the cells.
    // Delete is the GutterCell's own affair.
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
    }
    // Enter falls through: the cell's own click/open handling owns it.
    // Tab stays native everywhere, matching the rest of the form.
  };

  const openSharedEditor = (field: string) => {
    setSharedAutoOpen((previous) => ({
      field,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  };

  const materializeRow = (column: number) => {
    const rowIndex = state.rows.length;
    dispatch({ type: "addTokenRow", placeId: place.id });
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
    dispatch({
      type: "setTokenRowKind",
      placeId: place.id,
      row: rowIndex,
      rowKind: kind,
    });
    rowSelection.menu?.anchor.focus();
  };

  const renderDataRow = (row: AdHocRow, rowIndex: number) => {
    const kind = adHocRowKindOf(row);
    const isDynamic = row.kind === "template";
    const selected =
      rowSelection.selectedRow === rowIndex && selectedRowCellStyle;
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
                  kind="count"
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
                />
              </div>
            </td>
          </tr>
        ) : null}
        <tr>
          <td className={cx(gutterCellStyle, tint, selected)}>
            <GutterCell
              glyph={
                <span
                  className={cx(
                    kind === "dynamic" && dynamicGutterTextStyle,
                    kind === "optimized" && optimizedGutterTextStyle,
                  )}
                >
                  {isDynamic ? "i" : `#${rowIndex + 1}`}
                </span>
              }
              tooltip={
                kind === "fixed"
                  ? `Row ${
                      rowIndex + 1
                    } — one token. Enter chooses the row's kind, Delete removes it.`
                  : `Row ${rowIndex + 1} — dynamic${
                      kind === "optimized" ? ", count optimized" : ""
                    }. Enter chooses the row's kind, Delete removes it.`
              }
              label={`Row ${rowIndex + 1} kind`}
              menuLabel={`Row ${rowIndex + 1} menu`}
              items={[
                {
                  id: "fixed",
                  label: "Fixed row",
                  checked: kind === "fixed",
                },
                {
                  id: "dynamic",
                  label: "Dynamic count",
                  checked: kind === "dynamic",
                },
                ...(selection === "optimize"
                  ? [
                      {
                        id: "optimized",
                        label: "Optimized count",
                        checked: kind === "optimized",
                      },
                    ]
                  : []),
                { id: "delete", label: "Delete row", destructive: true },
              ]}
              onMenuSelect={(id) => {
                if (id === "delete") {
                  deleteRow(rowIndex);
                  return;
                }
                setRowKind(rowIndex, id as AdHocRowKind);
              }}
              menuAnchor={
                rowSelection.menu?.row === rowIndex
                  ? rowSelection.menu.anchor
                  : null
              }
              onOpenMenu={(anchor) => rowSelection.openMenu(rowIndex, anchor)}
              onCloseMenu={rowSelection.closeMenu}
              buttonRef={(element) => {
                if (element) {
                  gutterRefs.current.set(rowIndex, element);
                } else {
                  gutterRefs.current.delete(rowIndex);
                }
              }}
              onFocus={() => {
                rowSelection.setFocusedRow(rowIndex);
                setFocusedValue({
                  kind: "tokenRow",
                  placeId: place.id,
                  row: rowIndex,
                });
              }}
              onBlur={() => {
                rowSelection.setFocusedRow(null);
                setFocusedValue(null);
              }}
              onKeyDown={(event) =>
                handleGridKeyDown(event, { kind: "gutter", row: rowIndex })
              }
              onDelete={() => deleteRow(rowIndex)}
            />
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
                  kind={element.type}
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
                />
              </td>
            );
          })}
        </tr>
      </tbody>
    );
  };

  return (
    <>
      <FormSpreadsheet attach={attachZone} tone="raised">
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
                        dispatch(
                          shared
                            ? {
                                type: "unshareColumn",
                                placeId: place.id,
                                field: element.name,
                              }
                            : {
                                type: "shareColumn",
                                placeId: place.id,
                                field: element.name,
                                column: columnIndex,
                              },
                        )
                      }
                    >
                      {element.name}
                    </button>
                  </Tooltip>
                </th>
              );
            })}
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
                      kind={element.type}
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
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        ) : null}

        {state.rows.map((row, rowIndex) => renderDataRow(row, rowIndex))}

        {/* Phantom trailing row: a first click selects a phantom cell; a
            click on the selected cell, a double-click, or Enter materializes
            the row. The gutter's + materializes directly. */}
        <tbody>
          <PhantomLine
            gutterLabel="Add a token row"
            onMaterialize={() => materializeRow(0)}
          >
            {elements.map((element, columnIndex) => (
              <td
                key={element.elementId}
                className={cx(
                  cellStyle,
                  phantomRowCellStyle,
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
                  onPointerDown={phantomActivation.onPointerDown}
                  onClick={(event) => {
                    if (phantomActivation.shouldActivate(event)) {
                      materializeRow(columnIndex);
                    }
                  }}
                  onKeyDown={(event) =>
                    handleGridKeyDown(event, {
                      kind: "phantom",
                      column: columnIndex,
                    })
                  }
                />
              </td>
            ))}
          </PhantomLine>
        </tbody>
      </FormSpreadsheet>
      <div className={totalTextStyle}>
        {total.resolved ? `${total.total} tokens` : `${total.text} tokens`}
      </div>
    </>
  );
};
