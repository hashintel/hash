import { css, cva } from "@hashintel/ds-helpers/css";

import { DisabledTooltip } from "../../../../components/disabled-tooltip";
import type { Parameter } from "../../../../core/types/sdcpn";
import { useIsReadOnly } from "../../../../state/use-is-read-only";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const headerTitleStyle = css({
  fontWeight: "semibold",
  fontSize: "[16px]",
  marginBottom: "[8px]",
});

const fieldLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const inputStyle = cva({
  base: {
    fontSize: "[14px]",
    padding: "[6px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.15)]",
    borderRadius: "[4px]",
    width: "[100%]",
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.02)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "text",
      },
    },
    isMonospace: {
      true: {
        fontFamily: "[monospace]",
      },
      false: {},
    },
  },
  defaultVariants: {
    isDisabled: false,
    isMonospace: false,
  },
});

/**
 * Slugifies a string to a valid JavaScript identifier.
 * - Converts to lowercase
 * - Replaces spaces and special characters with underscores
 * - Removes leading/trailing underscores
 * - Ensures it doesn't start with a number
 */
const slugifyToIdentifier = (str: string): string => {
  return (
    str
      .toLowerCase()
      // Replace spaces and non-alphanumeric characters (except underscores) with underscores
      .replace(/[^a-z0-9_]+/g, "_")
      // Remove leading underscores
      .replace(/^_+/, "")
      // Remove trailing underscores
      .replace(/_+$/, "")
      // Ensure it doesn't start with a number
      .replace(/^(\d)/, "_$1")
  );
};

interface ParameterPropertiesProps {
  parameter: Parameter;
  updateParameter: (
    parameterId: string,
    updateFn: (parameter: Parameter) => void,
  ) => void;
}

export const ParameterProperties: React.FC<ParameterPropertiesProps> = ({
  parameter,
  updateParameter,
}) => {
  const isDisabled = useIsReadOnly();

  const handleUpdateName = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.name = event.target.value;
    });
  };

  const handleUpdateVariableName = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    // Allow free-form typing
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.variableName = event.target.value;
    });
  };

  const handleBlurVariableName = (
    event: React.FocusEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value.trim();
    if (value === "") {
      // Default to "param" if empty
      updateParameter(parameter.id, (existingParameter) => {
        existingParameter.variableName = "param";
      });
    } else {
      // Apply slugification on blur
      const slugified = slugifyToIdentifier(value);
      if (slugified !== value) {
        updateParameter(parameter.id, (existingParameter) => {
          existingParameter.variableName = slugified;
        });
      }
    }
  };

  const handleUpdateDefaultValue = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.defaultValue = event.target.value;
    });
  };

  return (
    <div className={containerStyle}>
      <div>
        <div className={headerTitleStyle}>Parameter</div>
      </div>

      {/* Name field */}
      <div>
        <div className={fieldLabelStyle}>Name</div>
        <DisabledTooltip disabled={isDisabled}>
          <input
            type="text"
            value={parameter.name}
            onChange={handleUpdateName}
            disabled={isDisabled}
            className={inputStyle({ isDisabled })}
          />
        </DisabledTooltip>
      </div>

      {/* Variable Name field */}
      <div>
        <div className={fieldLabelStyle}>Variable Name</div>
        <DisabledTooltip disabled={isDisabled}>
          <input
            type="text"
            value={parameter.variableName}
            onChange={handleUpdateVariableName}
            onBlur={handleBlurVariableName}
            disabled={isDisabled}
            className={inputStyle({ isDisabled, isMonospace: true })}
          />
        </DisabledTooltip>
      </div>

      {/* Type selector - hidden for now as internal code relies on "real" type */}

      {/* Default Value field */}
      <div>
        <div className={fieldLabelStyle}>Default Value</div>
        <DisabledTooltip disabled={isDisabled}>
          <input
            type="text"
            value={parameter.defaultValue}
            onChange={handleUpdateDefaultValue}
            disabled={isDisabled}
            className={inputStyle({ isDisabled, isMonospace: true })}
          />
        </DisabledTooltip>
      </div>
    </div>
  );
};
