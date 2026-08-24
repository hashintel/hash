/**
 * A Variables list, used at both scopes, in the form's spreadsheet grammar:
 * one row per Variable — name cell, type cell, value cell, Optimize (where
 * available), remove — plus a quiet phantom trailing row that materializes a
 * fresh Variable on click or Enter. The name cell behaves like every other
 * cell: focusing selects it, Enter (or a second click) edits, Escape leaves
 * the edit. Arrow keys move between cells, the type select included (Enter
 * opens it), and continue into the neighbouring form zone past the edges.
 */

import { use, useRef, useState } from "react";

import { Button, Select } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { toggleAdHocOptimize } from "@hashintel/petrinaut-core";

import { adHocVariableKey } from "./dependency-highlight";
import { AdHocFormContext } from "./form-context";
import {
  actionCellStyle,
  cellInputStyle,
  cellSelectStyle,
  cellStyle,
  dependencyHighlightStyle as highlightStyle,
  phantomCellButtonStyle,
  rowDeleteButtonStyle,
  tableContainerStyle,
  tableStyle,
} from "./form-table";
import { OptimizeToggle } from "./optimize-toggle";
import { newVariable, removeAt, replaceVariable } from "./state";
import { useNavigationGrid } from "./use-grid-navigation";
import { ValueEditor } from "./value-editor";

import type { AdHocVariable } from "@hashintel/petrinaut-core";

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

  if (editing) {
    return (
      <input
        ref={cellRef}
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
  onChange: (variables: AdHocVariable[]) => void;
  /**
   * Renders the table (its phantom row alone) even with no Variables.
   * Per-place lists stay hidden while empty; the top-level section shows.
   */
  alwaysVisible?: boolean;
}

export const VariableRows: React.FC<VariableRowsProps> = ({
  scopeLabel,
  placeId,
  variables,
  onChange,
  alwaysVisible = false,
}) => {
  const { errorFor, optimizable, highlight, setFocusedValue } =
    use(AdHocFormContext);
  const { register, onKeyDown, attach } = useNavigationGrid();
  // Nonces, so a repeat click re-triggers the fresh row's editor.
  const [materialized, setMaterialized] = useState<{
    index: number;
    part: "name" | "value";
    nonce: number;
  } | null>(null);

  if (variables.length === 0 && !alwaysVisible) {
    return null;
  }

  const materializeVariable = (part: "name" | "value") => {
    onChange([...variables, newVariable(variables)]);
    setMaterialized((previous) => ({
      index: variables.length,
      part,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
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
      onKeyDown(rowIndex, 1)(event);
    };

  return (
    <div ref={attach} className={tableContainerStyle} aria-label={scopeLabel}>
      <table className={tableStyle}>
        <tbody>
          {variables.map((variable, index) => {
            const target = { kind: "variable" as const, placeId, index };
            const nameError = errorFor({ target, part: "name" });
            const highlighted = highlight.variableKeys.has(
              adHocVariableKey(placeId, variable.name),
            );
            const rowHighlight = highlighted && highlightStyle;
            return (
              // Row identity is positional in the model.
              // eslint-disable-next-line react/no-array-index-key
              <tr key={index} data-highlighted={highlighted || undefined}>
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
                      materialized?.index === index &&
                      materialized.part === "name"
                        ? materialized.nonce
                        : 0
                    }
                    onFocusChange={(focused) =>
                      setFocusedValue(focused ? target : null)
                    }
                    cellRef={register(index, 0)}
                    onCellKeyDown={onKeyDown(index, 0)}
                    onChange={(name) =>
                      onChange(
                        replaceVariable(variables, index, {
                          ...variable,
                          name,
                        }),
                      )
                    }
                  />
                </td>
                {/* The Select drops className, so its cell styles the box
                    and registers the trigger for the grid. */}
                <td
                  ref={(element) =>
                    register(
                      index,
                      1,
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
                >
                  <Select
                    required
                    size="sm"
                    aria-label={`Type of ${variable.name}`}
                    value={variable.type}
                    onChange={(type) =>
                      onChange(
                        replaceVariable(variables, index, {
                          ...variable,
                          type,
                        }),
                      )
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
                    autoOpen={
                      materialized?.index === index &&
                      materialized.part === "value"
                        ? materialized.nonce
                        : 0
                    }
                    triggerRef={register(index, 2)}
                    onTriggerKeyDown={onKeyDown(index, 2)}
                    onChange={(value) =>
                      onChange(
                        replaceVariable(variables, index, {
                          ...variable,
                          ...value,
                        }),
                      )
                    }
                  />
                </td>
                {optimizable ? (
                  <td
                    className={cx(cellStyle, optimizeCellStyle, rowHighlight)}
                  >
                    <OptimizeToggle
                      label={`Optimize ${variable.name}`}
                      value={variable.optimize !== null}
                      buttonRef={register(index, 3)}
                      onKeyDown={onKeyDown(index, 3)}
                      onChange={(on) =>
                        onChange(
                          replaceVariable(variables, index, {
                            ...variable,
                            ...toggleAdHocOptimize(variable, on),
                          }),
                        )
                      }
                    />
                  </td>
                ) : null}
                <td className={cx(actionCellStyle, rowHighlight)}>
                  <Button
                    size="xs"
                    variant="ghost"
                    tone="neutral"
                    iconName="trash"
                    className={rowDeleteButtonStyle}
                    aria-label={`Remove ${variable.name}`}
                    onClick={() => onChange(removeAt(variables, index))}
                  />
                </td>
              </tr>
            );
          })}

          {/* Phantom trailing row: materializes a fresh Variable. */}
          <tr>
            <td className={cx(cellStyle, nameCellStyle)}>
              <button
                ref={register(variables.length, 0)}
                type="button"
                className={phantomCellButtonStyle}
                aria-label={`Add a variable (name, ${scopeLabel})`}
                onClick={() => materializeVariable("name")}
                onKeyDown={onKeyDown(variables.length, 0)}
              />
            </td>
            <td className={cx(cellStyle, typeCellStyle)} />
            <td className={cellStyle}>
              <button
                ref={register(variables.length, 2)}
                type="button"
                className={phantomCellButtonStyle}
                aria-label={`Add a variable (value, ${scopeLabel})`}
                onClick={() => materializeVariable("value")}
                onKeyDown={onKeyDown(variables.length, 2)}
              />
            </td>
            {optimizable ? (
              <td className={cx(cellStyle, optimizeCellStyle)} />
            ) : null}
            <td className={actionCellStyle} />
          </tr>
        </tbody>
      </table>
    </div>
  );
};
