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
 * Cells navigate by keyboard: arrows and Tab move between cells, Enter opens
 * the focused cell's editor, Escape closes it.
 */

import { useRef, useState } from "react";

import { Button, Popover, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  adHocRowKindOf,
  adHocTargetLabel,
  resolveAdHocPlaceTotal,
  setAdHocRowKind,
  shareAdHocColumn,
  unshareAdHocColumn,
  type AdHocColouredPlace,
  type AdHocRow,
  type AdHocRowKind,
  type AdHocScenarioState,
  type AdHocSynthesisContext,
  type Color,
  type Place,
} from "@hashintel/petrinaut-core";

import {
  actionCellStyle,
  cellStyle,
  columnHeaderStyle,
  footerRowStyle,
  gutterCellStyle,
  gutterHeaderStyle,
  tableContainerStyle,
  tableStyle,
} from "./form-table";
import { defaultCellsFor, updateCell, updateRow } from "./state";
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
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
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
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
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

const phantomCellButtonStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  height: "[28px]",
  border: "none",
  background: "[transparent]",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s60",
  cursor: "text",
  _hover: { backgroundColor: "neutral.s10" },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
  },
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
  _hover: { backgroundColor: "neutral.s15" },
});

const menuMarkStyle = css({
  width: "[14px]",
  fontFamily: "mono",
  color: "neutral.s80",
});

export interface TokenTableProps {
  place: Place;
  colour: Color;
  state: AdHocColouredPlace;
  onChange: (next: AdHocColouredPlace) => void;
  optimizable: boolean;
  /** The whole form state, for total resolution and labels. */
  formState: AdHocScenarioState;
  context: AdHocSynthesisContext;
}

export const TokenTable: React.FC<TokenTableProps> = ({
  place,
  colour,
  state,
  onChange,
  optimizable,
  formState,
  context,
}) => {
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
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const hasSharedColumns = Object.keys(state.sharedColumns).length > 0;
  const total = resolveAdHocPlaceTotal(formState, context, place.id);
  // The phantom row participates in keyboard navigation as the last row.
  const navigableRowCount = state.rows.length + 1;

  const focusCell = (row: number, column: number) => {
    cellRefs.current.get(`${row}-${column}`)?.focus();
  };

  const handleCellKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ) => {
    const move = (nextRow: number, nextColumn: number) => {
      event.preventDefault();
      event.stopPropagation();
      focusCell(nextRow, nextColumn);
    };
    if (event.key === "ArrowRight" && column < columnCount - 1) {
      move(row, column + 1);
    } else if (event.key === "ArrowLeft" && column > 0) {
      move(row, column - 1);
    } else if (event.key === "ArrowDown" && row < navigableRowCount - 1) {
      move(row + 1, column);
    } else if (event.key === "ArrowUp" && row > 0) {
      move(row - 1, column);
    } else if (event.key === "Tab") {
      if (event.shiftKey) {
        if (column > 0) {
          move(row, column - 1);
        } else if (row > 0) {
          move(row - 1, columnCount - 1);
        }
      } else if (column < columnCount - 1) {
        move(row, column + 1);
      } else if (row < navigableRowCount - 1) {
        move(row + 1, 0);
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

  const renderKindMenu = (
    rowIndex: number,
    row: AdHocRow,
    anchor: HTMLButtonElement,
  ) => {
    const current = adHocRowKindOf(row);
    const options: { kind: AdHocRowKind; label: string }[] = [
      { kind: "fixed", label: "Fixed row" },
      { kind: "dynamic", label: "Dynamic count" },
      ...(optimizable
        ? [{ kind: "optimized" as const, label: "Optimized count" }]
        : []),
    ];
    return (
      <Popover
        triggerRef={{ current: anchor }}
        position="bottom-start"
        onClose={() => setKindMenuState(null)}
      >
        <Popover.Container>
          <Popover.Body withPadding={false}>
            <div className={menuStyle} role="menu">
              {options.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current === option.kind}
                  className={menuItemStyle}
                  onClick={() => setRowKind(rowIndex, option.kind)}
                >
                  <span className={menuMarkStyle}>
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

  const renderDataRow = (row: AdHocRow, rowIndex: number) => {
    const kind = adHocRowKindOf(row);
    const isDynamic = row.kind === "template";
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
            <td className={cx(gutterCellStyle, stripCellStyle, tint)} />
            <td
              colSpan={columnCount}
              className={cx(cellStyle, stripCellStyle, tint)}
            >
              <div className={stripInnerStyle}>
                <span className={stripMarkStyle}>×</span>
                <ValueEditor
                  value={row.count}
                  target={countTarget}
                  label={adHocTargetLabel(countTarget, formState, context)}
                  optimizable={optimizable}
                  integer
                  withStep={false}
                  placeholder="1"
                  className={cx(
                    stripEditorStyle,
                    kind === "optimized" && stripEditorOptimizedStyle,
                  )}
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
            <td className={cx(actionCellStyle, stripCellStyle, tint)} />
          </tr>
        ) : null}
        <tr>
          <td className={cx(gutterCellStyle, tint)}>
            <Tooltip
              content={
                kind === "fixed"
                  ? `Row ${rowIndex + 1} — one token. Choose the row's kind.`
                  : `Row ${rowIndex + 1} — dynamic${kind === "optimized" ? ", count optimized" : ""}. Choose the row's kind.`
              }
            >
              <button
                type="button"
                className={gutterButtonStyle}
                aria-label={`Row ${rowIndex + 1} kind`}
                aria-haspopup="menu"
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
            {kindMenu?.row === rowIndex
              ? renderKindMenu(rowIndex, row, kindMenu.anchor)
              : null}
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
                className={cx(cellStyle, tint, shared && sharedWashStyle)}
              >
                <ValueEditor
                  value={shared ?? cell}
                  target={target}
                  label={adHocTargetLabel(
                    shared
                      ? {
                          kind: "column",
                          placeId: place.id,
                          column: columnIndex,
                        }
                      : target,
                    formState,
                    context,
                  )}
                  optimizable={optimizable}
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
                    handleCellKeyDown(event, rowIndex, columnIndex)
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
          <td className={cx(actionCellStyle, tint)}>
            <Button
              size="xs"
              variant="ghost"
              tone="neutral"
              aria-label={`Remove row ${rowIndex + 1}`}
              iconName="close"
              onClick={() =>
                onChange({
                  ...state,
                  rows: state.rows.filter((_, index) => index !== rowIndex),
                })
              }
            />
          </td>
        </tr>
      </tbody>
    );
  };

  return (
    <div className={tableContainerStyle}>
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
                      type="button"
                      className={headerButtonStyle}
                      aria-label={`Share column ${element.name}`}
                      aria-pressed={shared}
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
                      label={adHocTargetLabel(target, formState, context)}
                      optimizable={optimizable}
                      integer={element.type === "integer"}
                      booleanDomain={element.type === "boolean"}
                      autoOpen={
                        sharedAutoOpen?.field === element.name
                          ? sharedAutoOpen.nonce
                          : 0
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
                    handleCellKeyDown(event, state.rows.length, columnIndex)
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
