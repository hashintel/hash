import type { Parameter } from "../../../../core/types/sdcpn";
import { useIsReadOnly } from "../../../../state/use-is-read-only";

/**
 * Slugifies a string to a valid JavaScript identifier.
 * - Converts to lowercase
 * - Replaces spaces and special characters with underscores
 * - Removes leading/trailing underscores
 * - Ensures it doesn't start with a number
 */
function slugifyToIdentifier(str: string): string {
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
}

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Parameter
        </div>
      </div>

      {/* Name field */}
      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Name
        </div>
        <input
          type="text"
          value={parameter.name}
          onChange={handleUpdateName}
          disabled={isDisabled}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.15)",
            borderRadius: 4,
            width: "100%",
            backgroundColor: isDisabled ? "rgba(0, 0, 0, 0.02)" : "white",
            cursor: isDisabled ? "not-allowed" : "text",
          }}
        />
      </div>

      {/* Variable Name field */}
      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Variable Name
        </div>
        <input
          type="text"
          value={parameter.variableName}
          onChange={handleUpdateVariableName}
          onBlur={handleBlurVariableName}
          disabled={isDisabled}
          style={{
            fontSize: 14,
            fontFamily: "monospace",
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.15)",
            borderRadius: 4,
            width: "100%",
            backgroundColor: isDisabled ? "rgba(0, 0, 0, 0.02)" : "white",
            cursor: isDisabled ? "not-allowed" : "text",
          }}
        />
      </div>

      {/* Type selector - hidden for now as internal code relies on "real" type */}

      {/* Default Value field */}
      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Default Value
        </div>
        <input
          type="text"
          value={parameter.defaultValue}
          onChange={handleUpdateDefaultValue}
          disabled={isDisabled}
          style={{
            fontSize: 14,
            fontFamily: "monospace",
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.15)",
            borderRadius: 4,
            width: "100%",
            backgroundColor: isDisabled ? "rgba(0, 0, 0, 0.02)" : "white",
            cursor: isDisabled ? "not-allowed" : "text",
          }}
        />
      </div>
    </div>
  );
};
