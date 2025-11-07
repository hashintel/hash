import type { SDCPNType } from "../../../../../core/types/sdcpn";

// Pool of 10 well-differentiated colors for types
const TYPE_COLOR_POOL = [
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#10b981", // Green
  "#f59e0b", // Amber
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#6366f1", // Indigo
  "#84cc16", // Lime
];

interface TypePropertiesProps {
  type: SDCPNType;
  onUpdate: (typeId: string, updates: Partial<SDCPNType>) => void;
  globalMode: "edit" | "simulate";
}

export const TypeProperties: React.FC<TypePropertiesProps> = ({
  type,
  onUpdate,
  globalMode,
}) => {
  const isDisabled = globalMode === "simulate";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Type
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Name
        </div>
        <input
          type="text"
          value={type.name}
          onChange={(event) => {
            onUpdate(type.id, { name: event.target.value });
          }}
          disabled={isDisabled}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
            backgroundColor: isDisabled ? "rgba(0, 0, 0, 0.05)" : "white",
            cursor: isDisabled ? "not-allowed" : "text",
          }}
        />
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Color
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Color picker grid with fixed-size swatches */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {TYPE_COLOR_POOL.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  if (!isDisabled) {
                    onUpdate(type.id, { colorCode: color });
                  }
                }}
                disabled={isDisabled}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  backgroundColor: color,
                  border:
                    type.colorCode === color
                      ? "2px solid #000"
                      : "1px solid rgba(0, 0, 0, 0.1)",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  opacity: isDisabled ? 0.5 : 1,
                  padding: 0,
                  flexShrink: 0,
                }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
          {/* Current color display */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                backgroundColor: type.colorCode,
                border: "1px solid rgba(0, 0, 0, 0.1)",
              }}
            />
            <div style={{ fontSize: 12, fontFamily: "monospace" }}>
              {type.colorCode}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Icon ID
        </div>
        <input
          type="text"
          value={type.iconId}
          onChange={(event) => {
            onUpdate(type.id, { iconId: event.target.value });
          }}
          disabled={isDisabled}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
            backgroundColor: isDisabled ? "rgba(0, 0, 0, 0.05)" : "white",
            cursor: isDisabled ? "not-allowed" : "text",
          }}
        />
      </div>

      {type.elements.length > 0 && (
        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 8 }}>
            Elements ({type.elements.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {type.elements.map((element) => (
              <div
                key={element.id}
                style={{
                  padding: 8,
                  backgroundColor: "rgba(0, 0, 0, 0.03)",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  {element.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#666",
                  }}
                >
                  <span>Type: {element.type}</span>
                  <span style={{ fontFamily: "monospace" }}>{element.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {type.elements.length === 0 && (
        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
            Elements
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#999",
              fontStyle: "italic",
              padding: 8,
              backgroundColor: "rgba(0, 0, 0, 0.02)",
              borderRadius: 4,
            }}
          >
            No elements defined
          </div>
        </div>
      )}
    </div>
  );
};
