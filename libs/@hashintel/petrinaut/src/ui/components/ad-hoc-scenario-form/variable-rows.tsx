/**
 * A Variables list, used for both scopes: one row per Variable with its name,
 * declared type, value slot, Optimize toggle (where available), and removal.
 */

import { Button, Select, TextInput, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { toggleAdHocOptimize } from "@hashintel/petrinaut-core";

import { newVariable, removeAt, replaceVariable } from "./state";
import { ValueEditor } from "./value-editor";

import type { AdHocVariable } from "@hashintel/petrinaut-core";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const nameStyle = css({
  width: "[140px]",
  flex: "[0 0 auto]",
});

const typeStyle = css({
  width: "[110px]",
  flex: "[0 0 auto]",
});

const valueStyle = css({
  flex: "1",
  minWidth: "[0]",
});

const footerStyle = css({
  display: "flex",
  justifyContent: "flex-start",
});

export interface VariableRowsProps {
  scopeLabel: string;
  variables: AdHocVariable[];
  onChange: (variables: AdHocVariable[]) => void;
  optimizable: boolean;
}

export const VariableRows: React.FC<VariableRowsProps> = ({
  scopeLabel,
  variables,
  onChange,
  optimizable,
}) => (
  <div className={listStyle} aria-label={scopeLabel}>
    {variables.map((variable, index) => (
      // Row identity is positional in the model.
      // eslint-disable-next-line react/no-array-index-key
      <div key={index} className={rowStyle}>
        <div className={nameStyle}>
          <TextInput
            size="sm"
            aria-label={`Name of variable ${index + 1}`}
            value={variable.name}
            onChange={(name) =>
              onChange(replaceVariable(variables, index, { ...variable, name }))
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
                    type === "integer" || type === "boolean" ? type : "real",
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
        <div className={valueStyle}>
          <ValueEditor
            label={`Value of ${variable.name}`}
            value={variable}
            optimizable={optimizable && variable.type !== "boolean"}
            integer={variable.type === "integer"}
            onChange={(value) =>
              onChange(
                replaceVariable(variables, index, { ...variable, ...value }),
              )
            }
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
          variant="subtle"
          tone="neutral"
          onClick={() => onChange(removeAt(variables, index))}
        >
          Remove
        </Button>
      </div>
    ))}
    <div className={footerStyle}>
      <Button
        size="xs"
        variant="subtle"
        tone="neutral"
        onClick={() => onChange([...variables, newVariable(variables)])}
      >
        Add variable
      </Button>
    </div>
  </div>
);
