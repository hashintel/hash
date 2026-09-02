/**
 * The Parameters table: one row per net parameter — name, type, value slot
 * overriding the parameter's default, Optimize (where available) — in the
 * form's spreadsheet grammar and keyboard grid.
 */

import { use } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";
import { emptyAdHocValue } from "@hashintel/petrinaut-core";

import { useFocusGrid } from "../../worksheet/use-focus-grid";
import { AdHocFormContext, adHocSelectionText } from "./form-context";
import { FormSpreadsheet } from "./spreadsheet/form-spreadsheet";
import {
  cellStyle,
  dependencyHighlightStyle as highlightStyle,
  staticNameCellStyle,
  staticTypeCellStyle,
} from "./spreadsheet/form-table";
import { OptimizeToggle } from "./spreadsheet/optimize-toggle";
import { ValueEditor } from "./value-editor";

import type { AdHocNetParameter } from "@hashintel/petrinaut-core";

// An untouched parameter shows its default quietly: a small uppercase tag,
// then the value — both lighter than an actual override.
const defaultDisplayStyle = css({
  display: "inline-flex",
  alignItems: "baseline",
  gap: "1.5",
  // The value sits a step darker than the tag, still lighter than an
  // override's neutral.s110.
  color: "neutral.s100",
});

const defaultTagStyle = css({
  fontSize: "[9px]",
  fontWeight: "medium",
  textTransform: "uppercase",
  letterSpacing: "[0.5px]",
  color: "neutral.s80",
});

const parameterOptimizeCellStyle = css({
  width: "[92px]",
  paddingX: "1",
  textAlign: "center",
});

export interface ParameterRowsProps {
  entries: AdHocNetParameter[];
}

export const ParameterRows: React.FC<ParameterRowsProps> = ({ entries }) => {
  const {
    mode,
    synthesisContext,
    selection,
    highlight,
    setFocusedValue,
    dispatch,
  } = use(AdHocFormContext);
  const { register, onKeyDown, attach } = useFocusGrid();

  const entryFor = (parameterId: string): AdHocNetParameter =>
    entries.find((entry) => entry.parameterId === parameterId) ?? {
      parameterId,
      ...emptyAdHocValue(""),
    };

  return (
    <FormSpreadsheet attach={attach}>
      <tbody>
        {synthesisContext.netParameters.map((parameter, parameterIndex) => {
          const entry = entryFor(parameter.id);
          const target = {
            kind: "netParameter" as const,
            parameterId: parameter.id,
          };
          const highlighted = highlight.parameterIds.has(parameter.id);
          const rowHighlight = highlighted && highlightStyle;
          return (
            <tr key={parameter.id} data-highlighted={highlighted || undefined}>
              <td
                className={cx(cellStyle, rowHighlight)}
                style={{ width: 170 }}
              >
                <div className={staticNameCellStyle}>{parameter.name}</div>
              </td>
              <td className={cx(cellStyle, rowHighlight)} style={{ width: 84 }}>
                <div className={staticTypeCellStyle}>{parameter.type}</div>
              </td>
              <td className={cx(cellStyle, rowHighlight)}>
                <ValueEditor
                  target={target}
                  value={entry}
                  display={
                    entry.optimize
                      ? undefined
                      : entry.expression || (
                          <span className={defaultDisplayStyle}>
                            <span className={defaultTagStyle}>default</span>
                            {parameter.defaultValue}
                          </span>
                        )
                  }
                  kind={parameter.type}
                  readOnly={mode === "run"}
                  placeholder={parameter.defaultValue}
                  triggerRef={register(parameterIndex, 0)}
                  onTriggerKeyDown={onKeyDown(parameterIndex, 0)}
                />
              </td>
              {/* Optimize only: a net parameter cannot be exposed — the
                  Scenario Parameter toggle belongs to Variables alone. */}
              {selection === "optimize" ? (
                <td
                  className={cx(
                    cellStyle,
                    parameterOptimizeCellStyle,
                    rowHighlight,
                  )}
                  style={{ width: 92 }}
                  onFocus={() => setFocusedValue(target)}
                  onBlur={() => setFocusedValue(null)}
                >
                  <OptimizeToggle
                    text={adHocSelectionText(selection)}
                    label={`${adHocSelectionText(selection)} ${parameter.name}`}
                    value={entry.optimize !== null}
                    buttonRef={register(parameterIndex, 1)}
                    onKeyDown={onKeyDown(parameterIndex, 1)}
                    onChange={(on) =>
                      dispatch({ type: "toggleSelection", target, on })
                    }
                  />
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </FormSpreadsheet>
  );
};
