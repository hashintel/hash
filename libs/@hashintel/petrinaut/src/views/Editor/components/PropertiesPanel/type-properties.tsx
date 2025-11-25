import { css } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

import type { SDCPNType } from "../../../../core/types/sdcpn";
import { ColorSelect } from "./color-select";

/**
 * Slugify a string to make it a valid JavaScript identifier
 * - Converts to lowercase
 * - Replaces spaces and special chars with underscores
 * - Removes leading numbers
 * - Ensures it's not empty
 */
const slugifyToIdentifier = (input: string): string => {
  let slug = input
    .toLowerCase()
    .trim()
    // Replace spaces and non-alphanumeric chars with underscores
    .replace(/[^a-z0-9_]/g, "_")
    // Remove consecutive underscores
    .replace(/_+/g, "_")
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, "");

  // If it starts with a number, prefix with underscore
  if (/^[0-9]/.test(slug)) {
    slug = `_${slug}`;
  }

  // If empty after sanitization, use a default
  if (slug === "") {
    slug = "field";
  }

  return slug;
};

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
    // Find the next dimension number
    let maxNumber = 0;
    for (const element of type.elements) {
      // Match patterns like "dimension_1", "dimension_2", etc.
      const match = element.name.match(/dimension_(\d+)/i);
      if (match) {
        const num = Number.parseInt(match[1]!, 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    const nextNumber = maxNumber + 1;

    const newElement = {
      id: uuidv4(),
      name: `dimension_${nextNumber}`,
      type: "real" as const,
    };
    onUpdate(type.id, {
      elements: [...type.elements, newElement],
    });
  };

  const handleUpdateElementName = (elementId: string, newName: string) => {
    // Allow free-form typing - just update the value directly
    const updatedElements = type.elements.map((elem) =>
      elem.id === elementId ? { ...elem, name: newName } : elem,
    );
    onUpdate(type.id, { elements: updatedElements });
  };

  const handleBlurElementName = (elementId: string, currentName: string) => {
    // Slugify the name when user finishes editing
    const slugifiedName = slugifyToIdentifier(currentName);

    // Check for duplicates (excluding the current element)
    const isDuplicate = type.elements.some(
      (elem) => elem.id !== elementId && elem.name === slugifiedName,
    );

    if (isDuplicate) {
      // Show warning but still allow the update - the user can fix it
      // eslint-disable-next-line no-alert
      alert(
        `Warning: An element named "${slugifiedName}" already exists. Please use a unique name.`,
      );
      return;
    }

    // Only update if the slugified version is different
    if (currentName !== slugifiedName) {
      const updatedElements = type.elements.map((elem) =>
        elem.id === elementId ? { ...elem, name: slugifiedName } : elem,
      );
      onUpdate(type.id, { elements: updatedElements });
    }
  };

  const handleDeleteElement = (elementId: string, elementName: string) => {
    // Confirmation dialog using browser API
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `Delete element "${elementName}"?\n\nThis cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

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
    <>
      <style>
        {`
          .element-delete-button:not(:disabled):hover {
            background-color: rgba(239, 68, 68, 0.15) !important;
          }
        `}
      </style>
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
          <ColorSelect
            value={type.colorCode}
            onChange={(color) => {
              onUpdate(type.id, { colorCode: color });
            }}
            disabled={isDisabled}
          />
        </div>

        {/* Dimensions Section - Editable with drag-to-reorder */}
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
              Dimensions
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
              aria-label="Add dimension"
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
              No dimensions defined. Click + to add.
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
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: 6,
                    backgroundColor:
                      draggedIndex === index
                        ? "rgba(59, 130, 246, 0.1)"
                        : dragOverIndex === index
                          ? "rgba(59, 130, 246, 0.05)"
                          : "rgba(0, 0, 0, 0.03)",
                    borderRadius: 3,
                    border:
                      dragOverIndex === index
                        ? "1px dashed #3b82f6"
                        : "1px solid rgba(0, 0, 0, 0.1)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Drag handle */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                      cursor: isDisabled ? "default" : "grab",
                      opacity: 0.4,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 1.5,
                        backgroundColor: "#666",
                        borderRadius: 1,
                      }}
                    />
                    <div
                      style={{
                        width: 10,
                        height: 1.5,
                        backgroundColor: "#666",
                        borderRadius: 1,
                      }}
                    />
                    <div
                      style={{
                        width: 10,
                        height: 1.5,
                        backgroundColor: "#666",
                        borderRadius: 1,
                      }}
                    />
                  </div>

                  {/* Index chip */}
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#666",
                      backgroundColor: "rgba(0, 0, 0, 0.08)",
                      borderRadius: 3,
                      width: 24,
                      height: 24,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {index}
                  </div>

                  {/* Name input */}
                  <input
                    type="text"
                    value={element.name}
                    onChange={(event) => {
                      handleUpdateElementName(element.id, event.target.value);
                    }}
                    onBlur={(event) => {
                      handleBlurElementName(element.id, event.target.value);
                    }}
                    disabled={isDisabled}
                    placeholder="dimension_name"
                    style={{
                      fontSize: 13,
                      padding: "5px 8px",
                      border: "1px solid rgba(0, 0, 0, 0.15)",
                      borderRadius: 3,
                      flex: 1,
                      backgroundColor: isDisabled
                        ? "rgba(0, 0, 0, 0.02)"
                        : "white",
                      cursor: isDisabled ? "not-allowed" : "text",
                    }}
                  />

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteElement(element.id, element.name);
                    }}
                    disabled={isDisabled || type.elements.length === 1}
                    className={css({
                      fontSize: "[16px]",
                      width: "[28px]",
                      height: "[28px]",
                      borderRadius: "[3px]",
                      border: "1px solid [rgba(239, 68, 68, 0.2)]",
                      backgroundColor: "[rgba(239, 68, 68, 0.08)]",
                      color: "[#ef4444]",
                      cursor: "pointer",
                      fontWeight: "[600]",
                      lineHeight: "[1]",
                      transition: "[all 0.15s ease]",
                      flexShrink: "[0]",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      _hover: {
                        backgroundColor: "[rgba(239, 68, 68, 0.15)]",
                      },
                      _disabled: {
                        backgroundColor: "[rgba(0, 0, 0, 0.02)]",
                        color: "[#ccc]",
                        cursor: "not-allowed",
                      },
                    })}
                    aria-label={`Delete dimension ${element.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
