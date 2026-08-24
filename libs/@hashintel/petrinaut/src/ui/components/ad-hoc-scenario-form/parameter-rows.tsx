/**
 * The Parameters table: one row per net parameter — name, type, value slot
 * overriding the parameter's default, Optimize (where available) — in the
 * form's spreadsheet grammar and keyboard grid.
 */

import { use } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";
import { emptyAdHocValue } from "@hashintel/petrinaut-core";

import { AdHocFormContext, adHocSelectionText } from "./form-context";
import {
  cellStyle,
  dependencyHighlightStyle as highlightStyle,
  tableContainerStyle,
  tableStyle,
} from "./form-table";
import { OptimizeToggle } from "./optimize-toggle";
import { useNavigationGrid } from "./use-grid-navigation";
import { ValueEditor } from "./value-editor";

import type { AdHocNetParameter } from "@hashintel/petrinaut-core";

const parameterNameCellStyle = css({
  width: "[140px]",
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

const parameterTypeCellStyle = css({
  width: "[96px]",
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  fontFamily: "mono",
  fontSize: "xs",
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
  const { synthesisContext, selection, highlight, setFocusedValue, dispatch } =
    use(AdHocFormContext);
  const { register, onKeyDown, attach } = useNavigationGrid();

  const entryFor = (parameterId: string): AdHocNetParameter =>
    entries.find((entry) => entry.parameterId === parameterId) ?? {
      parameterId,
      ...emptyAdHocValue(""),
    };

  return (
    <div ref={attach} className={tableContainerStyle}>
      <table className={tableStyle}>
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
              <tr
                key={parameter.id}
                data-highlighted={highlighted || undefined}
              >
                <td
                  className={cx(cellStyle, rowHighlight)}
                  style={{ width: 140 }}
                >
                  <div className={parameterNameCellStyle}>{parameter.name}</div>
                </td>
                <td
                  className={cx(cellStyle, rowHighlight)}
                  style={{ width: 96 }}
                >
                  <div className={parameterTypeCellStyle}>{parameter.type}</div>
                </td>
                <td className={cx(cellStyle, rowHighlight)}>
                  <ValueEditor
                    target={target}
                    value={entry}
                    display={
                      entry.optimize
                        ? undefined
                        : entry.expression ||
                          `default (${parameter.defaultValue})`
                    }
                    integer={parameter.type === "integer"}
                    booleanDomain={parameter.type === "boolean"}
                    triggerRef={register(parameterIndex, 0)}
                    onTriggerKeyDown={onKeyDown(parameterIndex, 0)}
                  />
                </td>
                {selection !== "none" ? (
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
      </table>
    </div>
  );
};
