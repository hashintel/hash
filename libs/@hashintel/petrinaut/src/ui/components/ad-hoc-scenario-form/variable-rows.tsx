/**
 * A Variables list, used at both scopes, in the form's spreadsheet grammar:
 * one row per Variable — a gutter whose pop-up menu deletes the row, then
 * name, type, value, and Optimize (where available) cells — plus a quiet
 * trailing line whose first click selects it and whose second click (or
 * Enter, or the gutter's +) materializes a fresh Variable, reachable with
 * ArrowDown from any cell of the last row. The name cell
 * behaves like every other cell: focusing selects it, Enter (or a second
 * click) edits, Escape leaves the edit. Arrow keys move between cells, the
 * type select included (Enter opens it), and continue into the neighbouring
 * worksheet member past the edges.
 */

import { use, useRef, useState } from "react";

import { Icon, Select } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useFocusGrid } from "../../worksheet/use-focus-grid";
import { useRowSelection } from "../../worksheet/use-row-selection";
import { useSelectFirstActivation } from "../../worksheet/use-select-first";
import { FormSpreadsheet } from "../spreadsheet-kit/form-spreadsheet";
import {
  cellErrorUnderlineStyle,
  cellSelectStyle,
  cellStyle,
  dependencyHighlightStyle as highlightStyle,
  gutterCellStyle,
  lightGutterCellStyle,
  phantomCellButtonStyle,
  phantomRowCellStyle,
  selectedRowCellStyle,
} from "../spreadsheet-kit/form-table";
import { GutterCell } from "../spreadsheet-kit/gutter-cell";
import { OptimizeToggle } from "../spreadsheet-kit/optimize-toggle";
import { PhantomLine } from "../spreadsheet-kit/phantom-line";
import { TextCell } from "../spreadsheet-kit/text-cell";
import { adHocVariableKey } from "./dependency-highlight";
import {
  AdHocFormContext,
  adHocIntervalSelection,
  adHocSelectionApplies,
  adHocSelectionText,
} from "./form-context";
import { ValueEditor } from "./value-editor";

import type { AdHocVariable } from "@hashintel/petrinaut-core";

const gutterColumnStyle = css({
  width: "[40px]",
  minWidth: "[40px]",
});

const nameCellStyle = css({
  width: "[150px]",
});

const typeCellStyle = css({
  width: "[84px]",
  borderLeft: "[1px solid {colors.neutral.a05}]",
});

const optimizeCellStyle = css({
  width: "[92px]",
  paddingX: "1",
  textAlign: "center",
});

const exposeCellStyle = css({
  width: "[150px]",
  paddingX: "1",
  textAlign: "center",
});

export interface VariableRowsProps {
  scopeLabel: string;
  /** `null` for top-level Variables, the owning place id otherwise. */
  placeId: string | null;
  variables: AdHocVariable[];
}

/** Grid columns: 0 gutter, 1 name, 2 type, 3 value, 4 Optimize. */
const PHANTOM_COLUMNS = [0, 1, 2, 3, 4];

export const VariableRows: React.FC<VariableRowsProps> = ({
  scopeLabel,
  placeId,
  variables,
}) => {
  const { errorFor, selection, highlight, setFocusedValue, dispatch } =
    use(AdHocFormContext);
  // The trailing toggle column: the interval toggle (Optimize or Sweep) on
  // every numeric Variable; "Scenario Parameter" on top-level Variables only
  // in expose mode (a per-place Variable is a per-row intermediate — nothing
  // to expose).
  const toggleColumn =
    adHocIntervalSelection(selection) ||
    (selection === "expose" && placeId === null)
      ? selection
      : null;
  const { register, onKeyDown, attach } = useFocusGrid();
  const gutterRefs = useRef(new Map<number, HTMLButtonElement>());
  const phantomRef = useRef<HTMLButtonElement | null>(null);
  // Gutter focus selects the whole row; the selection highlight follows it.
  const rowSelection = useRowSelection();
  // The add-line selects on the first click and materializes on the second.
  const phantomActivation = useSelectFirstActivation();
  // A nonce, so a repeat click re-opens the fresh row's name editor.
  // `pending` marks the one variables change the materialize dispatch is
  // about to cause; any other change (undo, redo) clears the nonce, so a
  // row re-mounted by a replay never reopens its name editor.
  const [materialized, setMaterialized] = useState<{
    index: number;
    nonce: number;
    pending: boolean;
  } | null>(null);
  const [seenVariables, setSeenVariables] = useState(variables);
  if (variables !== seenVariables) {
    setSeenVariables(variables);
    if (materialized?.pending) {
      setMaterialized({ ...materialized, pending: false });
    } else if (materialized) {
      setMaterialized(null);
    }
  }

  const materializeVariable = () => {
    dispatch({ type: "addVariable", placeId });
    setMaterialized((previous) => ({
      index: variables.length,
      nonce: (previous?.nonce ?? 0) + 1,
      pending: true,
    }));
  };

  const deleteVariable = (index: number) => {
    dispatch({ type: "deleteVariable", placeId, index });
    const remaining = variables.length - 1;
    setTimeout(() => {
      if (remaining > 0) {
        gutterRefs.current.get(Math.min(index, remaining - 1))?.focus();
      } else {
        phantomRef.current?.focus();
      }
    }, 0);
  };

  /** Arrow keys on a closed type select navigate the grid; open, they are
   * the select's own. Enter always falls through and opens it. */
  const selectCellKeyDown =
    (rowIndex: number): React.KeyboardEventHandler =>
    (event) => {
      const trigger = (event.currentTarget as HTMLElement).querySelector(
        "[data-part='trigger']",
      );
      if (trigger?.getAttribute("aria-expanded") === "true") {
        return;
      }
      onKeyDown(rowIndex, 2)(event);
    };

  return (
    <FormSpreadsheet
      attach={attach}
      ariaLabel={scopeLabel}
      frame={placeId === null ? "regular" : "light"}
    >
      <tbody>
        {variables.map((variable, index) => {
          const target = { kind: "variable" as const, placeId, index };
          const nameError = errorFor({ target, part: "name" });
          const highlighted = highlight.variableKeys.has(
            adHocVariableKey(placeId, variable.name),
          );
          const rowHighlight = cx(
            highlighted && highlightStyle,
            rowSelection.selectedRow === index && selectedRowCellStyle,
          );
          return (
            // Row identity is positional in the model.
            // eslint-disable-next-line react/no-array-index-key
            <tr key={index} data-highlighted={highlighted || undefined}>
              <td
                className={cx(
                  gutterCellStyle,
                  lightGutterCellStyle,
                  gutterColumnStyle,
                  rowHighlight,
                )}
              >
                <GutterCell
                  glyph={<Icon name="bracketsCurly" size="xs" />}
                  label={`Variable ${index + 1} actions`}
                  menuLabel={`Variable ${index + 1} menu`}
                  items={[
                    {
                      id: "delete",
                      label: "Delete variable",
                      destructive: true,
                    },
                  ]}
                  onMenuSelect={(id) => {
                    if (id === "delete") {
                      deleteVariable(index);
                    }
                  }}
                  menuAnchor={
                    rowSelection.menu?.row === index
                      ? rowSelection.menu.anchor
                      : null
                  }
                  onOpenMenu={(anchor) => rowSelection.openMenu(index, anchor)}
                  onCloseMenu={rowSelection.closeMenu}
                  buttonRef={(element) => {
                    register(index, 0)(element);
                    if (element) {
                      gutterRefs.current.set(index, element);
                    } else {
                      gutterRefs.current.delete(index);
                    }
                  }}
                  onFocus={() => {
                    rowSelection.setFocusedRow(index);
                    setFocusedValue(target);
                  }}
                  onBlur={() => {
                    rowSelection.setFocusedRow(null);
                    setFocusedValue(null);
                  }}
                  onKeyDown={onKeyDown(index, 0)}
                  onDelete={() => deleteVariable(index)}
                />
              </td>
              <td
                className={cx(
                  cellStyle,
                  nameCellStyle,
                  nameError && cellErrorUnderlineStyle,
                  rowHighlight,
                )}
              >
                <TextCell
                  value={variable.name}
                  ariaLabel={`Name of variable ${index + 1} (${scopeLabel})`}
                  error={nameError}
                  autoEdit={
                    materialized?.index === index ? materialized.nonce : 0
                  }
                  onFocusChange={(focused) =>
                    setFocusedValue(focused ? target : null)
                  }
                  cellRef={register(index, 1)}
                  onCellKeyDown={onKeyDown(index, 1)}
                  onChange={(name) =>
                    dispatch({ type: "renameVariable", placeId, index, name })
                  }
                />
              </td>
              {/* The Select drops className, so its cell styles the box
                    and registers the trigger for the grid. */}
              <td
                ref={(element) =>
                  register(
                    index,
                    2,
                  )(
                    element
                      ? element.querySelector<HTMLElement>(
                          "[data-part='trigger']",
                        )
                      : null,
                  )
                }
                className={cx(
                  cellStyle,
                  typeCellStyle,
                  cellSelectStyle,
                  rowHighlight,
                )}
                onKeyDownCapture={selectCellKeyDown(index)}
                onFocus={() => setFocusedValue(target)}
                onBlur={() => setFocusedValue(null)}
              >
                <Select
                  required
                  size="sm"
                  aria-label={`Type of ${variable.name}`}
                  value={variable.type}
                  onChange={(type) => {
                    const setType = {
                      type: "setVariableType" as const,
                      placeId,
                      index,
                      variableType: type,
                    };
                    // A selection the new type cannot carry (a swept
                    // Variable turned boolean) would linger with nothing to
                    // clear it and refuse the run, so it turns off with the
                    // type, as one undo step.
                    dispatch(
                      toggleColumn !== null &&
                        toggleColumn !== "expose" &&
                        variable.optimize !== null &&
                        !adHocSelectionApplies(toggleColumn, type)
                        ? [
                            setType,
                            { type: "toggleSelection", target, on: false },
                          ]
                        : setType,
                    );
                  }}
                  items={[
                    { value: "real", text: "Real" },
                    { value: "integer", text: "Integer" },
                    { value: "boolean", text: "Boolean" },
                    { value: "ratio", text: "Ratio" },
                  ]}
                />
              </td>
              <td className={cx(cellStyle, rowHighlight)}>
                <ValueEditor
                  target={target}
                  value={variable}
                  kind={variable.type}
                  triggerRef={register(index, 3)}
                  onTriggerKeyDown={onKeyDown(index, 3)}
                />
              </td>
              {toggleColumn ? (
                <td
                  className={cx(
                    cellStyle,
                    toggleColumn === "expose"
                      ? exposeCellStyle
                      : optimizeCellStyle,
                    rowHighlight,
                  )}
                  onFocus={() => setFocusedValue(target)}
                  onBlur={() => setFocusedValue(null)}
                >
                  {/* A selection already on the Variable keeps its toggle
                      whatever the type, so it can always be turned off. */}
                  {toggleColumn === "expose" ||
                  adHocSelectionApplies(toggleColumn, variable.type) ||
                  variable.optimize !== null ? (
                    <OptimizeToggle
                      text={adHocSelectionText(toggleColumn)}
                      label={`${adHocSelectionText(toggleColumn)} ${variable.name}`}
                      value={
                        toggleColumn === "expose"
                          ? (variable.exposed ?? false)
                          : variable.optimize !== null
                      }
                      buttonRef={register(index, 4)}
                      onKeyDown={onKeyDown(index, 4)}
                      onChange={(on) =>
                        dispatch(
                          toggleColumn === "expose"
                            ? {
                                type: "setVariableExposed",
                                index,
                                exposed: on,
                              }
                            : { type: "toggleSelection", target, on },
                        )
                      }
                    />
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}

        {/* The trailing line materializes a fresh Variable; one cell,
            reachable with ArrowDown from any cell of the row above. */}
        <PhantomLine
          gutterLabel={`Add a variable from the gutter (${scopeLabel})`}
          onMaterialize={materializeVariable}
          gutterClassName={cx(gutterColumnStyle, lightGutterCellStyle)}
        >
          <td
            colSpan={toggleColumn ? 4 : 3}
            className={cx(cellStyle, phantomRowCellStyle)}
          >
            <button
              ref={(element) => {
                phantomRef.current = element;
                for (const column of PHANTOM_COLUMNS) {
                  register(variables.length, column)(element);
                }
              }}
              type="button"
              className={phantomCellButtonStyle}
              aria-label={`Add a variable (${scopeLabel})`}
              onPointerDown={phantomActivation.onPointerDown}
              onClick={(event) => {
                if (phantomActivation.shouldActivate(event)) {
                  materializeVariable();
                }
              }}
              onKeyDown={onKeyDown(variables.length, 0)}
            >
              Add a variable…
            </button>
          </td>
        </PhantomLine>
      </tbody>
    </FormSpreadsheet>
  );
};
