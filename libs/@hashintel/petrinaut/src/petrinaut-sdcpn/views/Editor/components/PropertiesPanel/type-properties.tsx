import { useState } from "react";

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

const ELEMENT_TYPES = ["real", "integer", "boolean"] as const;

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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Element management handlers
  const handleAddElement = () => {
    const newElement = {
      id: `elem-${Date.now()}`,
      name: "new_field",
      type: "real" as const,
    };
    onUpdate(type.id, {
      elements: [...type.elements, newElement],
    });
  };

  const handleUpdateElementName = (elementId: string, newName: string) => {
    const updatedElements = type.elements.map((elem) =>
      elem.id === elementId ? { ...elem, name: newName } : elem,
    );
    onUpdate(type.id, { elements: updatedElements });
  };

  const handleUpdateElementType = (
    elementId: string,
    newType: "real" | "integer" | "boolean",
  ) => {
    const updatedElements = type.elements.map((elem) =>
      elem.id === elementId ? { ...elem, type: newType } : elem,
    );
    onUpdate(type.id, { elements: updatedElements });
  };

  const handleDeleteElement = (elementId: string) => {
    const updatedElements = type.elements.filter(
      (elem) => elem.id !== elementId,
    );
    onUpdate(type.id, { elements: updatedElements });
  };

  // Drag and drop handlers for reordering
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (event: React.DragEvent, dropIndex: number) => {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newElements = [...type.elements];
    const [draggedElement] = newElements.splice(draggedIndex, 1);
    if (draggedElement) {
      newElements.splice(dropIndex, 0, draggedElement);
      onUpdate(type.id, { elements: newElements });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

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

      {/* Elements Section - Editable with drag-to-reorder */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 500, fontSize: 12 }}>
            Elements ({type.elements.length})
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                color: "#666",
                fontWeight: 400,
              }}
            >
              (order matters)
            </span>
          </div>
          <button
            type="button"
            onClick={handleAddElement}
            disabled={isDisabled}
            style={{
              fontSize: 16,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid rgba(0, 0, 0, 0.1)",
              backgroundColor: isDisabled
                ? "rgba(0, 0, 0, 0.05)"
                : "rgba(59, 130, 246, 0.1)",
              color: isDisabled ? "#999" : "#3b82f6",
              cursor: isDisabled ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
            aria-label="Add element"
          >
            +
          </button>
        </div>

        {type.elements.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "#999",
              fontStyle: "italic",
              padding: 8,
              backgroundColor: "rgba(0, 0, 0, 0.02)",
              borderRadius: 4,
              textAlign: "center",
            }}
          >
            No elements defined. Click + to add.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {type.elements.map((element, index) => (
              <div
                key={element.id}
                draggable={!isDisabled}
                onDragStart={() => {
                  handleDragStart(index);
                }}
                onDragOver={(event) => {
                  handleDragOver(event, index);
                }}
                onDrop={(event) => {
                  handleDrop(event, index);
                }}
                onDragEnd={handleDragEnd}
                style={{
                  padding: 8,
                  backgroundColor:
                    draggedIndex === index
                      ? "rgba(59, 130, 246, 0.1)"
                      : dragOverIndex === index
                        ? "rgba(59, 130, 246, 0.05)"
                        : "rgba(0, 0, 0, 0.03)",
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: isDisabled ? "default" : "grab",
                  border:
                    dragOverIndex === index
                      ? "1px dashed #3b82f6"
                      : "1px solid transparent",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Position indicator and drag handle */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#666",
                      backgroundColor: "rgba(0, 0, 0, 0.05)",
                      padding: "2px 6px",
                      borderRadius: 3,
                      minWidth: 20,
                      textAlign: "center",
                    }}
                  >
                    {index}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: "#999",
                      fontFamily: "monospace",
                    }}
                  >
                    {element.id}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteElement(element.id);
                    }}
                    disabled={isDisabled}
                    style={{
                      fontSize: 14,
                      padding: "2px 6px",
                      borderRadius: 3,
                      border: "none",
                      backgroundColor: "transparent",
                      color: isDisabled ? "#ccc" : "#ef4444",
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      fontWeight: 600,
                    }}
                    aria-label={`Delete element ${element.name}`}
                  >
                    ×
                  </button>
                </div>

                {/* Element name input */}
                <input
                  type="text"
                  value={element.name}
                  onChange={(event) => {
                    handleUpdateElementName(element.id, event.target.value);
                  }}
                  disabled={isDisabled}
                  placeholder="field_name"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    padding: "4px 6px",
                    border: "1px solid rgba(0, 0, 0, 0.1)",
                    borderRadius: 3,
                    width: "100%",
                    boxSizing: "border-box",
                    backgroundColor: isDisabled
                      ? "rgba(0, 0, 0, 0.02)"
                      : "white",
                    cursor: isDisabled ? "not-allowed" : "text",
                    marginBottom: 6,
                  }}
                />

                {/* Element type selector */}
                <select
                  value={element.type}
                  onChange={(event) => {
                    handleUpdateElementType(
                      element.id,
                      event.target.value as "real" | "integer" | "boolean",
                    );
                  }}
                  disabled={isDisabled}
                  style={{
                    fontSize: 12,
                    padding: "4px 6px",
                    border: "1px solid rgba(0, 0, 0, 0.1)",
                    borderRadius: 3,
                    width: "100%",
                    boxSizing: "border-box",
                    backgroundColor: isDisabled
                      ? "rgba(0, 0, 0, 0.02)"
                      : "white",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    color: "#666",
                  }}
                >
                  {ELEMENT_TYPES.map((typeOption) => (
                    <option key={typeOption} value={typeOption}>
                      {typeOption}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
