/**
 * A Variables list, used at both scopes, in the form's spreadsheet grammar:
 * one row per Variable — name cell, value cell, type cell, Optimize (where
 * available), remove. Adding happens from the owning header's icon-only
 * button, so an empty list renders nothing.
 */

import { use } from "react";

import { Button, Select } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  adHocTargetLabel,
  toggleAdHocOptimize,
} from "@hashintel/petrinaut-core";

import { AdHocFormContext } from "./form-context";
import {
  actionCellStyle,
  cellInputStyle,
  cellSelectStyle,
  cellStyle,
  tableContainerStyle,
  tableStyle,
} from "./form-table";
import { OptimizeToggle } from "./optimize-toggle";
import { removeAt, replaceVariable } from "./state";
import { ValueEditor } from "./value-editor";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocVariable,
} from "@hashintel/petrinaut-core";

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

const invalidNameStyle = css({
  "& input": {
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: "red.s90",
    textUnderlineOffset: "[3px]",
  },
});

export interface VariableRowsProps {
  scopeLabel: string;
  /** `null` for top-level Variables, the owning place id otherwise. */
  placeId: string | null;
  variables: AdHocVariable[];
  onChange: (variables: AdHocVariable[]) => void;
  optimizable: boolean;
  formState: AdHocScenarioState;
  context: AdHocSynthesisContext;
}

export const VariableRows: React.FC<VariableRowsProps> = ({
  scopeLabel,
  placeId,
  variables,
  onChange,
  optimizable,
  formState,
  context,
}) => {
  const { errorFor } = use(AdHocFormContext);

  if (variables.length === 0) {
    return null;
  }

  return (
    <div className={tableContainerStyle} aria-label={scopeLabel}>
      <table className={tableStyle}>
        <tbody>
          {variables.map((variable, index) => {
            const target = { kind: "variable" as const, placeId, index };
            const nameError = errorFor({ target, part: "name" });
            return (
              // Row identity is positional in the model.
              // eslint-disable-next-line react/no-array-index-key
              <tr key={index}>
                <td
                  className={cx(
                    cellStyle,
                    nameCellStyle,
                    nameError && invalidNameStyle,
                  )}
                >
                  <input
                    className={cellInputStyle}
                    aria-label={`Name of variable ${index + 1} (${scopeLabel})`}
                    title={nameError}
                    value={variable.name}
                    onChange={(event) =>
                      onChange(
                        replaceVariable(variables, index, {
                          ...variable,
                          name: event.target.value,
                        }),
                      )
                    }
                  />
                </td>
                <td className={cellStyle}>
                  <ValueEditor
                    label={adHocTargetLabel(target, formState, context)}
                    target={target}
                    value={variable}
                    optimizable={optimizable}
                    integer={variable.type === "integer"}
                    booleanDomain={variable.type === "boolean"}
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
                <td className={cx(cellStyle, typeCellStyle)}>
                  <Select
                    size="sm"
                    className={cellSelectStyle}
                    aria-label={`Type of ${variable.name}`}
                    value={variable.type}
                    onChange={(type) =>
                      onChange(
                        replaceVariable(variables, index, {
                          ...variable,
                          type:
                            type === "integer" || type === "boolean"
                              ? type
                              : "real",
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
                {optimizable ? (
                  <td className={cx(cellStyle, optimizeCellStyle)}>
                    <OptimizeToggle
                      label={`Optimize ${variable.name}`}
                      value={variable.optimize !== null}
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
                <td className={actionCellStyle}>
                  <Button
                    size="xs"
                    variant="ghost"
                    tone="neutral"
                    iconName="close"
                    aria-label={`Remove ${variable.name}`}
                    onClick={() => onChange(removeAt(variables, index))}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
