import type { Parameter } from "../../../../core/types/sdcpn";

interface ParameterPropertiesProps {
  parameter: Parameter;
}

export const ParameterProperties: React.FC<ParameterPropertiesProps> = ({
  parameter,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Parameter
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Name
        </div>
        <div style={{ fontSize: 14 }}>{parameter.name}</div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Variable Name
        </div>
        <div
          style={{
            fontSize: 14,
            fontFamily: "monospace",
            backgroundColor: "rgba(0, 0, 0, 0.03)",
            padding: "4px 8px",
            borderRadius: 4,
          }}
        >
          {parameter.variableName}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Type
        </div>
        <div
          style={{
            fontSize: 14,
            textTransform: "capitalize",
            display: "inline-block",
            padding: "4px 8px",
            backgroundColor:
              parameter.type === "real"
                ? "rgba(59, 130, 246, 0.1)"
                : parameter.type === "integer"
                  ? "rgba(16, 185, 129, 0.1)"
                  : "rgba(245, 158, 11, 0.1)",
            color:
              parameter.type === "real"
                ? "#3b82f6"
                : parameter.type === "integer"
                  ? "#10b981"
                  : "#f59e0b",
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          {parameter.type}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Default Value
        </div>
        <div
          style={{
            fontSize: 14,
            fontFamily: "monospace",
            backgroundColor: "rgba(0, 0, 0, 0.03)",
            padding: "8px",
            borderRadius: 4,
          }}
        >
          {parameter.defaultValue}
        </div>
      </div>

      <div
        style={{
          marginTop: 8,
          padding: 8,
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          borderRadius: 4,
          fontSize: 11,
          color: "#666",
        }}
      >
        <strong>Note:</strong> Editing parameter properties is not yet
        available.
      </div>
    </div>
  );
};
