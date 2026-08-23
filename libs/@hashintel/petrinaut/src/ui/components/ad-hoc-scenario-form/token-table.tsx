/**
 * The token spreadsheet under a coloured place: one column per colour
 * element, one row per token row. The row gutter cycles the row's kind —
 * Fixed (`#n`) → Dynamic (`i`, blue) → count-Optimized (`i`, purple) → Fixed —
 * and dynamic rows carry a quiet strip above their cells showing `×` and the
 * count (or its bounds). Column headers toggle shared values: sharing paints
 * the column with a subtle wash under the row tints, puts one value slot
 * directly below the header, and renders the cells beneath as dimmed derived
 * copies whose clicks edit the shared value. A phantom trailing row
 * materializes into a fixed row on click, and the place's token total sits at
 * the bottom — a number when it resolves, the expression otherwise.
 */

import { useState } from "react";

import { Button, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  adHocTargetLabel,
  cycleAdHocRowKind,
  resolveAdHocPlaceTotal,
  shareAdHocColumn,
  unshareAdHocColumn,
} from "@hashintel/petrinaut-core";

import { defaultCellsFor, updateCell, updateRow } from "./state";
import { ValueEditor } from "./value-editor";

import type {
  AdHocColouredPlace,
  AdHocRow,
  AdHocScenarioState,
  AdHocSynthesisContext,
  Color,
  Place,
} from "@hashintel/petrinaut-core";

const GUTTER_WIDTH = "36px";
const REMOVE_WIDTH = "28px";

const tableStyle = css({
  display: "grid",
  alignItems: "stretch",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
});

const headerCellStyle = css({
  display: "flex",
  alignItems: "flex-end",
  minWidth: "[0]",
  paddingX: "1",
  paddingY: "1",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const headerButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  maxWidth: "[100%]",
  border: "[none]",
  background: "[transparent]",
  padding: "[0]",
  // The Tooltip wrapper zeroes line-height; restore the text's box.
  lineHeight: "[1.3]",
  minHeight: "[16px]",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  cursor: "pointer",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  _hover: { color: "neutral.s120" },
});

const cellStyle = css({
  display: "flex",
  alignItems: "center",
  minWidth: "[0]",
  minHeight: "[30px]",
  paddingX: "0.5",
});

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

const gutterStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "[30px]",
  border: "[none]",
  background: "[transparent]",
  padding: "[0]",
  fontFamily: "mono",
  fontSize: "[10px]",
  color: "neutral.s80",
});

const gutterButtonStyle = css({
  cursor: "pointer",
  _hover: { color: "neutral.s120", backgroundColor: "neutral.s20" },
});

const dynamicGutterTextStyle = css({
  color: "blue.s100",
  fontStyle: "italic",
});

const optimizedGutterTextStyle = css({
  color: "purple.s100",
  fontStyle: "italic",
});

const stripStyle = css({
  gridColumn: "[2 / -2]",
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  paddingX: "1",
  fontFamily: "mono",
  fontSize: "[10px]",
});

const stripMarkStyle = css({
  color: "neutral.s70",
});

const stripEditorStyle = css({
  fontSize: "[10px]",
  paddingY: "[1px]",
  color: "blue.s110",
});

const stripEditorOptimizedStyle = css({
  color: "purple.s110",
});

const removeCellStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "[30px]",
});

const phantomGutterStyle = css({
  opacity: "[0.45]",
});

const phantomCellStyle = css({
  display: "flex",
  alignItems: "center",
  minWidth: "[0]",
  minHeight: "[30px]",
  paddingX: "1",
  border: "[none]",
  background: "[transparent]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s60",
  cursor: "text",
  _hover: { backgroundColor: "neutral.s10" },
});

const totalStyle = css({
  gridColumn: "[1 / -1]",
  display: "flex",
  justifyContent: "flex-end",
  paddingX: "1",
  paddingY: "1",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
  fontFamily: "mono",
  fontSize: "[10px]",
  color: "neutral.s80",
});

const fullWidthEditorStyle = css({
  width: "[100%]",
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
  // Nonces, so a repeat click re-triggers the editor's auto-open effect.
  const [materializedCell, setMaterializedCell] = useState<{
    row: number;
    column: number;
    nonce: number;
  } | null>(null);
  const [sharedAutoOpen, setSharedAutoOpen] = useState<{
    field: string;
    nonce: number;
  } | null>(null);

  const hasSharedColumns = Object.keys(state.sharedColumns).length > 0;
  const total = resolveAdHocPlaceTotal(formState, context, place.id);

  const gridTemplateColumns = `${GUTTER_WIDTH} repeat(${elements.length}, minmax(0, 1fr)) ${REMOVE_WIDTH}`;

  const materializeRow = (column: number) => {
    const rowIndex = state.rows.length;
    onChange({
      ...state,
      rows: [
        ...state.rows,
        { kind: "fixed", cells: defaultCellsFor(elements) },
      ],
    });
    setMaterializedCell((previous) => ({
      row: rowIndex,
      column,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  };

  const openSharedEditor = (field: string) => {
    setSharedAutoOpen((previous) => ({
      field,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  };

  const renderRow = (row: AdHocRow, rowIndex: number) => {
    const isDynamic = row.kind === "template";
    const countOptimized = isDynamic && row.count.optimize !== null;
    const tint =
      isDynamic && (countOptimized ? optimizedRowStyle : dynamicRowStyle);
    const countTarget = {
      kind: "count" as const,
      placeId: place.id,
      row: rowIndex,
    };

    return (
      <>
        {isDynamic ? (
          <>
            <div className={cx(gutterStyle, tint)} />
            <div className={cx(stripStyle, tint)}>
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
                  countOptimized && stripEditorOptimizedStyle,
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
            <div className={cx(removeCellStyle, tint)} />
          </>
        ) : null}

        <Tooltip
          content={
            isDynamic
              ? `Row ${rowIndex + 1} — dynamic${countOptimized ? ", count optimized" : ""}. Click to cycle its kind.`
              : `Row ${rowIndex + 1} — one token. Click to make it dynamic.`
          }
        >
          <button
            type="button"
            className={cx(gutterStyle, gutterButtonStyle, tint)}
            aria-label={`Cycle kind of row ${rowIndex + 1}`}
            onClick={() =>
              onChange(updateRow(state, rowIndex, cycleAdHocRowKind))
            }
          >
            <span
              className={cx(
                isDynamic && !countOptimized && dynamicGutterTextStyle,
                countOptimized && optimizedGutterTextStyle,
              )}
            >
              {isDynamic ? "i" : `#${rowIndex + 1}`}
            </span>
          </button>
        </Tooltip>
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
            <div
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
                derived={Boolean(shared)}
                autoOpen={autoOpen}
                className={fullWidthEditorStyle}
                onOpenDerived={() => openSharedEditor(element.name)}
                onChange={(next) =>
                  onChange(updateCell(state, rowIndex, columnIndex, () => next))
                }
              />
            </div>
          );
        })}
        <div className={cx(removeCellStyle, tint)}>
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
        </div>
      </>
    );
  };

  return (
    <div className={tableStyle} style={{ gridTemplateColumns }}>
      {/* Header row: share toggles. */}
      <div className={headerCellStyle} />
      {elements.map((element, columnIndex) => {
        const shared = Boolean(state.sharedColumns[element.name]);
        return (
          <div
            key={element.elementId}
            className={cx(headerCellStyle, shared && sharedWashStyle)}
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
                      : shareAdHocColumn(state, element.name, columnIndex),
                  )
                }
              >
                {element.name}
              </button>
            </Tooltip>
          </div>
        );
      })}
      <div className={headerCellStyle} />

      {/* Shared values row: one slot directly below each shared header. */}
      {hasSharedColumns ? (
        <>
          <div className={cellStyle} />
          {elements.map((element, columnIndex) => {
            const shared = state.sharedColumns[element.name];
            if (!shared) {
              return <div key={element.elementId} className={cellStyle} />;
            }
            const target = {
              kind: "column" as const,
              placeId: place.id,
              column: columnIndex,
            };
            return (
              <div
                key={element.elementId}
                className={cx(cellStyle, sharedWashStyle)}
              >
                <ValueEditor
                  value={shared}
                  target={target}
                  label={adHocTargetLabel(target, formState, context)}
                  optimizable={optimizable}
                  integer={element.type === "integer"}
                  autoOpen={
                    sharedAutoOpen?.field === element.name
                      ? sharedAutoOpen.nonce
                      : 0
                  }
                  className={fullWidthEditorStyle}
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
              </div>
            );
          })}
          <div className={cellStyle} />
        </>
      ) : null}

      {/* Token rows: identity is positional in the model. */}
      {state.rows.map((row, rowIndex) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={rowIndex} style={{ display: "contents" }}>
          {renderRow(row, rowIndex)}
        </div>
      ))}

      {/* Phantom trailing row: materializes on click. */}
      <div className={cx(gutterStyle, phantomGutterStyle)}>
        #{state.rows.length + 1}
      </div>
      {elements.map((element, columnIndex) => (
        <button
          key={element.elementId}
          type="button"
          className={cx(
            phantomCellStyle,
            state.sharedColumns[element.name] && sharedWashStyle,
          )}
          aria-label={`Add a token row (${element.name})`}
          onClick={() => materializeRow(columnIndex)}
        >
          …
        </button>
      ))}
      <div className={removeCellStyle} />

      {/* Place total. */}
      <div className={totalStyle}>
        {total.resolved ? `= ${total.total} tokens` : `= ${total.text} tokens`}
      </div>
    </div>
  );
};
