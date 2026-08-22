/**
 * One place's section of the ad-hoc form.
 *
 * Coloured places render the token spreadsheet: one column per colour
 * element, a gutter showing `#n` for fixed rows and `i` for template rows
 * (with the row's count in a quiet strip beneath), clickable column headers
 * that share a column's value, and per-place Variables. Uncoloured places
 * are one count slot.
 */

import { Button, Icon, Toggle, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  shareAdHocColumn,
  toggleAdHocOptimize,
  unshareAdHocColumn,
} from "@hashintel/petrinaut-core";

import {
  defaultCellsFor,
  emptyValue,
  removeAt,
  updateCell,
  updateRow,
} from "./state";
import { ValueEditor } from "./value-editor";
import { VariableRows } from "./variable-rows";

import type {
  AdHocColouredPlace,
  AdHocRow,
  AdHocUncolouredPlace,
  Color,
  Place,
} from "@hashintel/petrinaut-core";

const blockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s110",
});

const headerActionsStyle = css({
  display: "flex",
  gap: "1",
  marginLeft: "auto",
});

const tableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  fontSize: "xs",
  tableLayout: "fixed",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
});

const gutterStyle = css({
  width: "[44px]",
  paddingX: "1",
  textAlign: "center",
  color: "neutral.s90",
  fontFamily: "mono",
  borderRightWidth: "[1px]",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
  backgroundColor: "neutral.s15",
});

const templateGutterStyle = css({
  backgroundColor: "blue.s20",
  color: "blue.s110",
});

const optimizedGutterStyle = css({
  backgroundColor: "purple.s20",
  color: "purple.s110",
});

const columnHeaderStyle = css({
  padding: "1",
  textAlign: "left",
  fontWeight: "medium",
  color: "neutral.s100",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.s20" },
});

const sharedColumnHeaderStyle = css({
  backgroundColor: "neutral.s30",
});

const cellStyle = css({
  padding: "0.5",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  overflow: "hidden",
});

const countStripStyle = css({
  paddingX: "2",
  paddingY: "0.5",
  fontSize: "[10px]",
  color: "blue.s100",
  backgroundColor: "blue.s10",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const rowRemoveStyle = css({
  width: "[28px]",
  textAlign: "center",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const uncolouredRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "xs",
  color: "neutral.s100",
});

const gutterButtonStyle = css({
  all: "unset",
  display: "block",
  width: "[100%]",
  cursor: "pointer",
});

interface RowViewProps {
  row: AdHocRow;
  rowIndex: number;
  elements: Color["elements"];
  state: AdHocColouredPlace;
  onChange: (state: AdHocColouredPlace) => void;
  optimizable: boolean;
}

const RowView: React.FC<RowViewProps> = ({
  row,
  rowIndex,
  elements,
  state,
  onChange,
  optimizable,
}) => {
  const template = row.kind === "template";
  const countOptimized = template && row.count.optimize !== null;

  const cellsRow = (
    <tr>
      <td
        className={cx(
          gutterStyle,
          template && templateGutterStyle,
          countOptimized && optimizedGutterStyle,
        )}
      >
        {template ? (
          <Tooltip content="Template row: one token per i">
            <span>i</span>
          </Tooltip>
        ) : (
          `#${rowIndex + 1}`
        )}
      </td>
      {row.cells.map((cell, columnIndex) => {
        const element = elements[columnIndex];
        const name = element?.name ?? String(columnIndex);
        const shared = element ? state.sharedColumns[name] : undefined;
        return (
          // Column identity is positional in the model.
          // eslint-disable-next-line react/no-array-index-key
          <td key={columnIndex} className={cellStyle}>
            <ValueEditor
              label={`${name}, row ${rowIndex + 1}`}
              value={shared ?? cell}
              derived={Boolean(shared)}
              optimizable={
                optimizable &&
                element?.type !== "string" &&
                element?.type !== "uuid"
              }
              integer={element?.type === "integer"}
              onChange={(next) =>
                onChange(updateCell(state, rowIndex, columnIndex, () => next))
              }
            />
          </td>
        );
      })}
      <td className={rowRemoveStyle}>
        <button
          type="button"
          aria-label={`Remove row ${rowIndex + 1}`}
          className={gutterButtonStyle}
          onClick={() =>
            onChange({ ...state, rows: removeAt(state.rows, rowIndex) })
          }
        >
          <Icon name="close" size="xs" />
        </button>
      </td>
    </tr>
  );

  if (!template) {
    return cellsRow;
  }

  return (
    <>
      {cellsRow}
      <tr>
        <td className={cx(gutterStyle, templateGutterStyle)} />
        <td colSpan={elements.length + 1} className={countStripStyle}>
          <span>×</span>
          <ValueEditor
            label={`Token count of template row ${rowIndex + 1}`}
            value={row.count}
            optimizable={optimizable}
            integer
            onChange={(count) =>
              onChange(
                updateRow(state, rowIndex, (existing) =>
                  existing.kind === "template"
                    ? { ...existing, count }
                    : existing,
                ),
              )
            }
          />
        </td>
      </tr>
    </>
  );
};

export interface ColouredPlaceBlockProps {
  place: Place;
  colour: Color;
  state: AdHocColouredPlace;
  onChange: (state: AdHocColouredPlace) => void;
  optimizable: boolean;
}

export const ColouredPlaceBlock: React.FC<ColouredPlaceBlockProps> = ({
  place,
  colour,
  state,
  onChange,
  optimizable,
}) => {
  const elements = colour.elements;

  const addRow = (kind: AdHocRow["kind"]) => {
    const cells = defaultCellsFor(elements);
    const row: AdHocRow =
      kind === "fixed"
        ? { kind: "fixed", cells }
        : { kind: "template", count: emptyValue("1"), cells };
    onChange({ ...state, rows: [...state.rows, row] });
  };

  return (
    <div className={blockStyle}>
      <div className={headerStyle}>
        <span>{place.name}</span>
        <div className={headerActionsStyle}>
          <Button
            size="xs"
            variant="subtle"
            tone="neutral"
            onClick={() => addRow("fixed")}
          >
            Add row
          </Button>
          <Button
            size="xs"
            variant="subtle"
            tone="neutral"
            onClick={() => addRow("template")}
          >
            Add template
          </Button>
        </div>
      </div>

      <VariableRows
        scopeLabel={`Variables of ${place.name}`}
        variables={state.variables}
        onChange={(variables) => onChange({ ...state, variables })}
        optimizable={optimizable}
      />

      {state.rows.length > 0 ? (
        <table className={tableStyle}>
          <thead>
            <tr>
              <th className={gutterStyle} aria-label="Row" />
              {elements.map((element, columnIndex) => {
                const shared = Boolean(state.sharedColumns[element.name]);
                return (
                  <th key={element.elementId} className={cellStyle}>
                    <Tooltip
                      content={
                        shared
                          ? "Un-share this column's value"
                          : "Share one value for the whole column"
                      }
                    >
                      <button
                        type="button"
                        aria-label={`Share column ${element.name}`}
                        aria-pressed={shared}
                        className={cx(
                          columnHeaderStyle,
                          shared && sharedColumnHeaderStyle,
                          css({ width: "[100%]" }),
                        )}
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
                        {shared ? " ⟲" : ""}
                      </button>
                    </Tooltip>
                    {shared ? (
                      <ValueEditor
                        label={`Shared value for ${element.name}`}
                        value={state.sharedColumns[element.name]!}
                        optimizable={
                          optimizable &&
                          element.type !== "string" &&
                          element.type !== "uuid"
                        }
                        integer={element.type === "integer"}
                        onChange={(shared_) =>
                          onChange({
                            ...state,
                            sharedColumns: {
                              ...state.sharedColumns,
                              [element.name]: shared_,
                            },
                          })
                        }
                      />
                    ) : null}
                  </th>
                );
              })}
              <th className={rowRemoveStyle} aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row, rowIndex) => {
              const rowProps = {
                row,
                rowIndex,
                elements,
                state,
                onChange,
                optimizable,
              };
              // Row identity is positional in the model.
              // eslint-disable-next-line react/no-array-index-key
              return <RowView key={rowIndex} {...rowProps} />;
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
};

export interface UncolouredPlaceBlockProps {
  place: Place;
  state: AdHocUncolouredPlace;
  onChange: (state: AdHocUncolouredPlace) => void;
  optimizable: boolean;
}

export const UncolouredPlaceBlock: React.FC<UncolouredPlaceBlockProps> = ({
  place,
  state,
  onChange,
  optimizable,
}) => (
  <div className={blockStyle}>
    <div className={headerStyle}>{place.name}</div>
    <div className={uncolouredRowStyle}>
      <span>Token count</span>
      <ValueEditor
        label={`Token count of ${place.name}`}
        value={state.count}
        optimizable={optimizable}
        integer
        onChange={(count) => onChange({ ...state, count })}
      />
      {optimizable ? (
        <Toggle
          size="xs"
          value={state.count.optimize !== null}
          onChange={(on) =>
            onChange({ ...state, count: toggleAdHocOptimize(state.count, on) })
          }
        />
      ) : null}
    </div>
  </div>
);
