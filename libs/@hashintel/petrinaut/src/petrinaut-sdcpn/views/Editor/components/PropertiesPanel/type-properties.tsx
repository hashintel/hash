import type { SDCPNType } from "../../../../../core/types/sdcpn";

interface TypePropertiesProps {
  type: SDCPNType;
}

export const TypeProperties: React.FC<TypePropertiesProps> = ({ type }) => {
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
        <div style={{ fontSize: 14 }}>{type.name}</div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>ID</div>
        <div style={{ fontSize: 12, color: "#666", fontFamily: "monospace" }}>
          {type.id}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Color
        </div>
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

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Icon ID
        </div>
        <div style={{ fontSize: 14 }}>{type.iconId}</div>
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
        <strong>Note:</strong> Editing type properties is not yet available.
      </div>
    </div>
  );
};
