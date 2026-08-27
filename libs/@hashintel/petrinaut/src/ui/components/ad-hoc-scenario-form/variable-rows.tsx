/**
 * A Variables list, used at both scopes, in the form's spreadsheet grammar:
 * one row per Variable — a gutter whose pop-up menu deletes the row, then
 * name, type, value, and Optimize (where available) cells — plus a quiet
 * trailing line that materializes a fresh Variable on click or Enter,
 * reachable with ArrowDown from any cell of the last row. The name cell
 * behaves like every other cell: focusing selects it, Enter (or a second
 * click) edits, Escape leaves the edit. Arrow keys move between cells, the
 * type select included (Enter opens it), and continue into the neighbouring
 * form zone past the edges.
 */

import { use, useEffect, useRef, useState } from "react";

import { Icon, Select } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { adHocVariableKey } from "./dependency-highlight";
import { AdHocFormContext, adHocSelectionText } from "./form-context";
import { useNavigationGrid } from "./navigation/use-grid-navigation";
import { FormSpreadsheet } from "./spreadsheet/form-spreadsheet";
import {
  cellInputStyle,
  cellSelectStyle,
  cellStyle,
  dependencyHighlightStyle as highlightStyle,
  gutterCellStyle,
  phantomCellButtonStyle,
  phantomRowCellStyle,
  selectedRowCellStyle,
} from "./spreadsheet/form-table";
import { GutterCell } from "./spreadsheet/gutter-cell";
import { OptimizeToggle } from "./spreadsheet/optimize-toggle";
import { PhantomLine } from "./spreadsheet/phantom-line";
import { useRowSelection } from "./spreadsheet/use-row-selection";
import { ValueEditor } from "./value-editor";

import type { AdHocVariable } from "@hashintel/petrinaut-core";

const gutterColumnStyle = css({
  width: "[40px]",
  minWidth: "[40px]",
});

const nameCellStyle = css({
  width: "[140px]",
});

const typeCellStyle = css({
  width: "[96px]",
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

const nameButtonStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  height: "[28px]",
  border: "none",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s110",
  backgroundColor: "[transparent]",
  cursor: "pointer",
  textAlign: "left",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  _hover: { backgroundColor: "neutral.s10" },
  // Plain :focus, not :focus-visible: a pointer click selects the cell and
  // the selection must show either way.
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
  },
});

const invalidNameStyle = css({
  "& input, & span": {
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: "red.s90",
    textUnderlineOffset: "[3px]",
  },
});

interface NameCellProps {
  value: string;
  ariaLabel: string;
  error: string | undefined;
  /** Enters edit mode when this becomes a fresh non-zero nonce. */
  autoEdit: number;
  onChange: (name: string) => void;
  /** The row holds focus (name cell focused or in edit). */
  onFocusChange: (focused: boolean) => void;
  cellRef: (element: HTMLElement | null) => void;
  onCellKeyDown: React.KeyboardEventHandler;
}

/**
 * The variable-name cell, with the same selection model as the value cells:
 * a pointer click selects, a second click (or a double-click, or Enter)
 * edits, and Enter or Escape leaves the edit back to the selected cell.
 */
const NameCell: React.FC<NameCellProps> = ({
  value,
  ariaLabel,
  error,
  autoEdit,
  onChange,
  onFocusChange,
  cellRef,
  onCellKeyDown,
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wasFocusedOnPointerDownRef = useRef(false);
  const [editing, setEditing] = useState(autoEdit > 0);
  const [seenAutoEdit, setSeenAutoEdit] = useState(autoEdit);
  if (autoEdit !== seenAutoEdit) {
    setSeenAutoEdit(autoEdit);
    if (autoEdit > 0) {
      setEditing(true);
    }
  }

  const closeEdit = () => {
    setEditing(false);
    setTimeout(() => buttonRef.current?.focus(), 0);
  };

  // Escape leaves the edit. Handled natively at window capture, because the
  // form root swallows in-form Escapes there (to spare the host drawer)
  // before React's delegated handlers would run; registered while editing —
  // after the root's listener — so it still sees the swallowed event.
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!editing) {
      return;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.target === inputRef.current) {
        closeEdit();
      }
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  });

  if (editing) {
    return (
      <input
        ref={(element) => {
          inputRef.current = element;
          cellRef(element);
        }}
        className={cellInputStyle}
        aria-label={ariaLabel}
        title={error}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeEdit();
            return;
          }
          onCellKeyDown(event);
        }}
        onBlur={() => {
          setEditing(false);
          onFocusChange(false);
        }}
        onFocus={(event) => {
          event.target.select();
          onFocusChange(true);
        }}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- entering edit mode is an explicit intent
        autoFocus
      />
    );
  }

  return (
    <button
      ref={(element) => {
        buttonRef.current = element;
        cellRef(element);
      }}
      type="button"
      className={nameButtonStyle}
      aria-label={ariaLabel}
      title={error}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onPointerDown={() => {
        wasFocusedOnPointerDownRef.current =
          document.activeElement === buttonRef.current;
      }}
      onClick={(event) => {
        // A keyboard "click" (Enter/Space) carries no pointer detail and
        // always edits; a pointer click edits only an already-selected cell.
        if (event.detail === 0 || wasFocusedOnPointerDownRef.current) {
          setEditing(true);
        }
      }}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={onCellKeyDown}
    >
      <span>{value}</span>
    </button>
  );
};

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
  // The trailing toggle column: Optimize on every Variable in optimize
  // mode; "Scenario Parameter" on top-level Variables only in expose mode
  // (a per-place Variable is a per-row intermediate — nothing to expose).
  const toggleColumn =
    selection === "optimize" || (selection === "expose" && placeId === null)
      ? selection
      : null;
  const { register, onKeyDown, attach } = useNavigationGrid();
  const gutterRefs = useRef(new Map<number, HTMLButtonElement>());
  const phantomRef = useRef<HTMLButtonElement | null>(null);
  // Gutter focus selects the whole row; the selection highlight follows it.
  const rowSelection = useRowSelection();
  // A nonce, so a repeat click re-opens the fresh row's name editor.
  const [materialized, setMaterialized] = useState<{
    index: number;
    nonce: number;
  } | null>(null);

  const materializeVariable = () => {
    dispatch({ type: "addVariable", placeId });
    setMaterialized((previous) => ({
      index: variables.length,
      nonce: (previous?.nonce ?? 0) + 1,
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
    <FormSpreadsheet attach={attach} ariaLabel={scopeLabel}>
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
                className={cx(gutterCellStyle, gutterColumnStyle, rowHighlight)}
              >
                <GutterCell
                  glyph={<Icon name="function" size="xs" />}
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
                  nameError && invalidNameStyle,
                  rowHighlight,
                )}
              >
                <NameCell
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
                  onChange={(type) =>
                    dispatch({
                      type: "setVariableType",
                      placeId,
                      index,
                      variableType: type,
                    })
                  }
                  items={[
                    { value: "real", text: "Real" },
                    { value: "integer", text: "Integer" },
                    { value: "boolean", text: "Boolean" },
                  ]}
                />
              </td>
              <td className={cx(cellStyle, rowHighlight)}>
                <ValueEditor
                  target={target}
                  value={variable}
                  integer={variable.type === "integer"}
                  booleanDomain={variable.type === "boolean"}
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
                          ? { type: "setVariableExposed", index, exposed: on }
                          : { type: "toggleSelection", target, on },
                      )
                    }
                  />
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
          gutterClassName={gutterColumnStyle}
        >
          <td
            colSpan={toggleColumn ? 3 : 2}
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
              onClick={materializeVariable}
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
