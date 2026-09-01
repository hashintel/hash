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

import { focusLands } from "../../worksheet/focus-flow";
import {
  useFocusStops,
  type FocusStop,
  type FocusStopTarget,
} from "../../worksheet/use-focus-stops";
import { useRowSelection } from "../../worksheet/use-row-selection";
import { useSelectFirstActivation } from "../../worksheet/use-select-first";
import { AdHocFormContext } from "./form-context";
import { FormSpreadsheet } from "./spreadsheet/form-spreadsheet";
import {
  cellStyle,
  columnHeaderStyle,
  gutterCellStyle,
  gutterHeaderStyle,
  phantomCellButtonStyle,
  phantomRowCellStyle,
  rowPaletteVars,
  rowTintCellStyle,
  rowTintStrongStyle,
  selectedRowCellStyle,
} from "./spreadsheet/form-table";
import { GutterCell } from "./spreadsheet/gutter-cell";
import { PhantomLine } from "./spreadsheet/phantom-line";
import { ValueEditor } from "./value-editor";

// A background image, not a solid color, so it composites over row tints.
const sharedWashStyle = css({
  backgroundImage:
    "[linear-gradient(rgba(120, 120, 130, 0.07), rgba(120, 120, 130, 0.07))]",
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

const targetKey = ({ stopId, column }: FocusStopTarget): string =>
  `${stopId}:${column}`;

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
  const {
    mode,
    formState,
    synthesisContext,
    selection,
    setFocusedValue,
    dispatch,
  } = use(AdHocFormContext);
  // Run mode: cells and gutters stay focusable and walkable, but nothing
  // edits and no rows are added or removed.
  const readOnly = mode === "run";
  const elements = colour.elements;
  const columnCount = elements.length;
  // Nonces, so a repeat click re-triggers the editor's auto-open behaviour.
  // `pending` marks the one rows change the materialize dispatch is about to
  // cause; any other rows change (undo, redo, an external reset) clears the
  // nonce, so a cell re-mounted by a replay never reopens its editor.
  const [materializedCell, setMaterializedCell] = useState<{
    row: number;
    column: number;
    nonce: number;
    pending: boolean;
  } | null>(null);
  const [seenRows, setSeenRows] = useState(state.rows);
  if (state.rows !== seenRows) {
    setSeenRows(state.rows);
    if (materializedCell?.pending) {
      setMaterializedCell({ ...materializedCell, pending: false });
    } else if (materializedCell) {
      setMaterializedCell(null);
    }
  }
  const [sharedAutoOpen, setSharedAutoOpen] = useState<{
    field: string;
    nonce: number;
  } | null>(null);
  // Gutter focus selects the whole row; the selection highlight follows it.
  const rowSelection = useRowSelection();
  // Phantom cells select on the first click and materialize on the second.
  const phantomActivation = useSelectFirstActivation();
  const targets = useRef<Map<string, HTMLButtonElement>>(new Map());

  const hasSharedColumns = Object.keys(state.sharedColumns).length > 0;
  const sharedColumnIndexes = elements.flatMap((element, columnIndex) =>
    state.sharedColumns[element.name] ? [columnIndex] : [],
  );
  const total = resolveAdHocPlaceTotal(formState, synthesisContext, place.id);

  // Every keyboard-reachable line of the table, top to bottom, declared as
  // worksheet stops: the column headers, the shared values (a sparse line),
  // then each row's count strip (a full-width stop above a dynamic row's
  // cells) and cells, then the phantom row. The phantom row declares no
  // gutter, so the gutter lane ends at the last data row and exits the
  // table there. Tab stays native everywhere (tabIndexFor unused), matching
  // the rest of the form.
  const stops: FocusStop[] = [
    { id: "header", kind: "row" },
    ...(hasSharedColumns
      ? [
          {
            id: "shared",
            kind: "sparse" as const,
            columns: sharedColumnIndexes,
          },
        ]
      : []),
    ...state.rows.flatMap<FocusStop>((row, index) =>
      row.kind === "template"
        ? [
            { id: `strip-${index}`, kind: "full" },
            { id: `cells-${index}`, kind: "row", gutter: true },
          ]
        : [{ id: `cells-${index}`, kind: "row", gutter: true }],
    ),
    ...(readOnly ? [] : [{ id: "phantom", kind: "row" } as const]),
  ];

  const { attach, onKeyDown, onFocusTarget } = useFocusStops({
    stops,
    columnCount,
    focusTarget: (target) => focusLands(targets.current.get(targetKey(target))),
  });

  const registerTarget =
    (position: FocusStopTarget) => (element: HTMLButtonElement | null) => {
      if (element) {
        targets.current.set(targetKey(position), element);
      } else {
        targets.current.delete(targetKey(position));
      }
    };

  const deleteRow = (rowIndex: number) => {
    dispatch({ type: "deleteTokenRow", placeId: place.id, row: rowIndex });
    // Focus the same gutter position after React commits the removal; the
    // phantom row's first cell when the last row went.
    const remaining = state.rows.length - 1;
    setTimeout(() => {
      const survivor =
        remaining > 0
          ? {
              stopId: `cells-${Math.min(rowIndex, remaining - 1)}`,
              column: "gutter" as const,
            }
          : { stopId: "phantom", column: 0 };
      targets.current.get(targetKey(survivor))?.focus();
    }, 0);
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
      pending: true,
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
    const countTarget = {
      kind: "count" as const,
      placeId: place.id,
      row: rowIndex,
    };

    return (
      // The row kind's palette variables scope to the tbody, so the count
      // strip, the gutter, the cells, and every interactive shade on them
      // derive from one colour.
      <tbody key={rowIndex} style={rowPaletteVars[kind]}>
        {isDynamic ? (
          <tr>
            <td
              className={cx(
                gutterCellStyle,
                stripCellStyle,
                rowTintStrongStyle,
                selected,
              )}
            />
            <td
              colSpan={columnCount}
              className={cx(
                cellStyle,
                stripCellStyle,
                rowTintStrongStyle,
                selected,
              )}
            >
              <div className={stripInnerStyle}>
                <span className={stripMarkStyle}>×</span>
                <ValueEditor
                  value={row.count}
                  target={countTarget}
                  kind="count"
                  readOnly={readOnly}
                  placeholder="1"
                  className={cx(
                    stripEditorStyle,
                    kind === "optimized" && stripEditorOptimizedStyle,
                  )}
                  triggerRef={registerTarget({
                    stopId: `strip-${rowIndex}`,
                    column: 0,
                  })}
                  onTriggerFocus={() =>
                    onFocusTarget({ stopId: `strip-${rowIndex}`, column: 0 })
                  }
                  onTriggerKeyDown={onKeyDown({
                    stopId: `strip-${rowIndex}`,
                    column: 0,
                  })}
                />
              </div>
            </td>
          </tr>
        ) : null}
        <tr>
          <td className={cx(gutterCellStyle, selected)}>
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
              buttonRef={registerTarget({
                stopId: `cells-${rowIndex}`,
                column: "gutter",
              })}
              onFocus={() => {
                onFocusTarget({
                  stopId: `cells-${rowIndex}`,
                  column: "gutter",
                });
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
              onKeyDown={onKeyDown({
                stopId: `cells-${rowIndex}`,
                column: "gutter",
              })}
              onDelete={() => deleteRow(rowIndex)}
              readOnly={readOnly}
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
                  rowTintCellStyle,
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
                  readOnly={readOnly}
                  autoOpen={autoOpen}
                  onOpenDerived={() => openSharedEditor(element.name)}
                  triggerRef={registerTarget({
                    stopId: `cells-${rowIndex}`,
                    column: columnIndex,
                  })}
                  onTriggerFocus={() =>
                    onFocusTarget({
                      stopId: `cells-${rowIndex}`,
                      column: columnIndex,
                    })
                  }
                  onTriggerKeyDown={onKeyDown({
                    stopId: `cells-${rowIndex}`,
                    column: columnIndex,
                  })}
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
      <FormSpreadsheet attach={attach} tone="raised">
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
                      readOnly
                        ? element.name
                        : shared
                          ? "Shared value — click to release the column"
                          : "Click to share one value across the column"
                    }
                  >
                    <button
                      ref={registerTarget({
                        stopId: "header",
                        column: columnIndex,
                      })}
                      type="button"
                      className={headerButtonStyle}
                      aria-label={`Share column ${element.name}`}
                      aria-pressed={shared}
                      onFocus={() =>
                        onFocusTarget({
                          stopId: "header",
                          column: columnIndex,
                        })
                      }
                      onKeyDown={onKeyDown({
                        stopId: "header",
                        column: columnIndex,
                      })}
                      onClick={() => {
                        if (readOnly) {
                          return;
                        }
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
                        );
                      }}
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
                      readOnly={readOnly}
                      autoOpen={
                        sharedAutoOpen?.field === element.name
                          ? sharedAutoOpen.nonce
                          : 0
                      }
                      triggerRef={registerTarget({
                        stopId: "shared",
                        column: columnIndex,
                      })}
                      onTriggerFocus={() =>
                        onFocusTarget({
                          stopId: "shared",
                          column: columnIndex,
                        })
                      }
                      onTriggerKeyDown={onKeyDown({
                        stopId: "shared",
                        column: columnIndex,
                      })}
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
            the row. The gutter's + materializes directly. Run mode adds no
            rows, so the line is gone entirely. */}
        {readOnly ? null : (
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
                    ref={registerTarget({
                      stopId: "phantom",
                      column: columnIndex,
                    })}
                    type="button"
                    className={phantomCellButtonStyle}
                    aria-label={`Add a token row (${element.name})`}
                    onPointerDown={phantomActivation.onPointerDown}
                    onClick={(event) => {
                      if (phantomActivation.shouldActivate(event)) {
                        materializeRow(columnIndex);
                      }
                    }}
                    onFocus={() =>
                      onFocusTarget({ stopId: "phantom", column: columnIndex })
                    }
                    onKeyDown={onKeyDown({
                      stopId: "phantom",
                      column: columnIndex,
                    })}
                  />
                </td>
              ))}
            </PhantomLine>
          </tbody>
        )}
      </FormSpreadsheet>
      <div className={totalTextStyle}>
        {total.resolved ? `${total.total} tokens` : `${total.text} tokens`}
      </div>
    </>
  );
};
