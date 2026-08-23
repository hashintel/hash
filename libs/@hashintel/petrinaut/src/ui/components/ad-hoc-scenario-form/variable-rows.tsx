/**
 * A Variables list, used at both scopes: one compact row per Variable — name,
 * value slot, declared type, Optimize (where available), remove. Rows are
 * joined into one bordered block with hairline separators, rounded only at
 * the first and last row. Adding happens from the owning header's icon-only
 * button, so an empty list renders nothing.
 */

import { Button, Select, TextInput, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  adHocTargetLabel,
  toggleAdHocOptimize,
} from "@hashintel/petrinaut-core";

import { removeAt, replaceVariable } from "./state";
import { ValueEditor } from "./value-editor";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocVariable,
} from "@hashintel/petrinaut-core";

const blockStyle = css({
  display: "flex",
  flexDirection: "column",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  overflow: "hidden",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingX: "1.5",
  paddingY: "1",
  "& + &": {
    borderTopWidth: "[1px]",
    borderTopStyle: "solid",
    borderTopColor: "neutral.bd.subtle",
  },
});

const nameStyle = css({
  width: "[130px]",
  flex: "[0 0 auto]",
});

const valueStyle = css({
  flex: "1",
  minWidth: "[0]",
});

const typeStyle = css({
  width: "[96px]",
  flex: "[0 0 auto]",
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
  if (variables.length === 0) {
    return null;
  }

  return (
    <div className={blockStyle} aria-label={scopeLabel}>
      {variables.map((variable, index) => {
        const target = { kind: "variable" as const, placeId, index };
        return (
          // Row identity is positional in the model.
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className={rowStyle}>
            <div className={nameStyle}>
              <TextInput
                size="sm"
                variant="subtle"
                aria-label={`Name of variable ${index + 1} (${scopeLabel})`}
                value={variable.name}
                onChange={(name) =>
                  onChange(
                    replaceVariable(variables, index, { ...variable, name }),
                  )
                }
              />
            </div>
            <div className={valueStyle}>
              <ValueEditor
                label={adHocTargetLabel(target, formState, context)}
                target={target}
                value={variable}
                optimizable={optimizable && variable.type !== "boolean"}
                integer={variable.type === "integer"}
                onChange={(value) =>
                  onChange(
                    replaceVariable(variables, index, {
                      ...variable,
                      ...value,
                    }),
                  )
                }
              />
            </div>
            <div className={typeStyle}>
              <Select
                size="sm"
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
            </div>
            {optimizable ? (
              <Toggle
                size="xs"
                aria-label={`Optimize ${variable.name}`}
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
            ) : null}
            <Button
              size="xs"
              variant="ghost"
              tone="neutral"
              iconName="close"
              aria-label={`Remove ${variable.name}`}
              onClick={() => onChange(removeAt(variables, index))}
            />
          </div>
        );
      })}
    </div>
  );
};
