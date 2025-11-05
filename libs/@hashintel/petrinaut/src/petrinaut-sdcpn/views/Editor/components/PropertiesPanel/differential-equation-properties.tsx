import MonacoEditor from "@monaco-editor/react";

import type {
  DifferentialEquation,
  SDCPNType,
} from "../../../../../core/types/sdcpn";

interface DifferentialEquationPropertiesProps {
  differentialEquation: DifferentialEquation;
  types: SDCPNType[];
}

export const DifferentialEquationProperties: React.FC<
  DifferentialEquationPropertiesProps
> = ({ differentialEquation, types }) => {
  const associatedType = types.find(
    (type) => type.id === differentialEquation.typeId,
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Differential Equation
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Name
        </div>
        <div style={{ fontSize: 14 }}>{differentialEquation.name}</div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Associated Type
        </div>
        {associatedType ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: associatedType.colorCode,
                flexShrink: 0,
              }}
            />
            <div style={{ fontSize: 14 }}>{associatedType.name}</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>
            {differentialEquation.typeId || "No type assigned"}
          </div>
        )}
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 8 }}>
          Code
        </div>
        <div
          style={{
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            overflow: "hidden",
            flex: 1,
            minHeight: 0,
          }}
        >
          <MonacoEditor
            language="typescript"
            value={differentialEquation.code}
            theme="vs-light"
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: "on",
              folding: true,
              glyphMargin: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 3,
              padding: { top: 8, bottom: 8 },
              readOnly: true,
            }}
          />
        </div>
      </div>

      <div
        style={{
          padding: 8,
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          borderRadius: 4,
          fontSize: 11,
          color: "#666",
          flexShrink: 0,
        }}
      >
        <strong>Note:</strong> Editing differential equation properties is not
        yet available.
      </div>
    </div>
  );
};
