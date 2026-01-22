import { css, cva } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { Tooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import type { Color } from "../../../../core/types/sdcpn";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { ColorSelect } from "./color-select";

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
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    width: "[100%]",
    boxSizing: "border-box",
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "text",
      },
    },
  },
});

const dimensionsHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[8px]",
});

const dimensionsLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
});

const dimensionsHintStyle = css({
  marginLeft: "[6px]",
  fontSize: "[11px]",
  color: "[#666]",
  fontWeight: "normal",
});

const addDimensionButtonStyle = cva({
  base: {
    fontSize: "[16px]",
    padding: "[2px 8px]",
    borderRadius: "[4px]",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    fontWeight: "semibold",
    cursor: "pointer",
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        color: "[#999]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[rgba(59, 130, 246, 0.1)]",
        color: "[#3b82f6]",
        cursor: "pointer",
      },
    },
  },
});

const emptyDimensionsStyle = css({
  fontSize: "[12px]",
  color: "[#999]",
  fontStyle: "italic",
  padding: "[8px]",
  backgroundColor: "[rgba(0, 0, 0, 0.02)]",
  borderRadius: "[4px]",
  textAlign: "center",
});

const dimensionsListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const dimensionRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[6px]",
    padding: "[6px]",
    borderRadius: "[3px]",
    transition: "[all 0.15s ease]",
  },
  variants: {
    isDragged: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.1)]",
        border: "[1px solid rgba(0, 0, 0, 0.1)]",
      },
      false: {
        backgroundColor: "[rgba(0, 0, 0, 0.03)]",
        border: "[1px solid rgba(0, 0, 0, 0.1)]",
      },
    },
    isDragOver: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.05)]",
        border: "[1px dashed #3b82f6]",
      },
      false: {},
    },
  },
});

const dragHandleStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "[1.5px]",
    opacity: "[0.4]",
    flexShrink: 0,
  },
  variants: {
    isDisabled: {
      true: {
        cursor: "default",
      },
      false: {
        cursor: "grab",
      },
    },
  },
});

const dragHandleLineStyle = css({
  width: "[10px]",
  height: "[1.5px]",
  backgroundColor: "[#666]",
  borderRadius: "[1px]",
});

const indexChipStyle = css({
  fontSize: "[11px]",
  fontWeight: "semibold",
  color: "[#666]",
  backgroundColor: "[rgba(0, 0, 0, 0.08)]",
  borderRadius: "[3px]",
  width: "[24px]",
  height: "[24px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

const dimensionNameInputStyle = cva({
  base: {
    fontSize: "[13px]",
    padding: "[5px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.15)]",
    borderRadius: "[3px]",
    flex: "1",
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
  },
});

const deleteDimensionButtonStyle = css({
  fontSize: "[16px]",
  width: "[28px]",
  height: "[28px]",
  borderRadius: "[3px]",
  border: "[1px solid rgba(239, 68, 68, 0.2)]",
  backgroundColor: "[rgba(239, 68, 68, 0.08)]",
  color: "[#ef4444]",
  cursor: "pointer",
  fontWeight: "semibold",
  lineHeight: "[1]",
  transition: "[all 0.15s ease]",
  flexShrink: 0,
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
});

// --- Helpers ---

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
  type: Color;
  updateType: (typeId: string, updateFn: (type: Color) => void) => void;
}

export const TypeProperties: React.FC<TypePropertiesProps> = ({
  type,
  updateType,
}) => {
  const isDisabled = useIsReadOnly();
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
      elementId: uuidv4(),
      name: `dimension_${nextNumber}`,
      type: "real" as const,
    };
    updateType(type.id, (existingType) => {
      existingType.elements.push(newElement);
    });
  };

  const handleUpdateElementName = (elementId: string, newName: string) => {
    // Allow free-form typing - just update the value directly
    updateType(type.id, (existingType) => {
      for (const element of existingType.elements) {
        if (element.elementId === elementId) {
          element.name = newName;
          break;
        }
      }
    });
  };

  const handleBlurElementName = (elementId: string, currentName: string) => {
    // Slugify the name when user finishes editing
    const slugifiedName = slugifyToIdentifier(currentName);

    // Check for duplicates (excluding the current element)
    const isDuplicate = type.elements.some(
      (elem) => elem.elementId !== elementId && elem.name === slugifiedName,
    );

    if (isDuplicate) {
      // eslint-disable-next-line no-alert
      alert(
        `Warning: An element named "${slugifiedName}" already exists. Please use a unique name.`,
      );
      return;
    }

    // Only update if the slugified version is different
    if (currentName !== slugifiedName) {
      updateType(type.id, (existingType) => {
        for (const element of existingType.elements) {
          if (element.elementId === elementId) {
            element.name = slugifiedName;
            break;
          }
        }
      });
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

    updateType(type.id, (existingType) => {
      const index = existingType.elements.findIndex(
        (elem) => elem.elementId === elementId,
      );
      if (index !== -1) {
        existingType.elements.splice(index, 1);
      }
    });
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

    updateType(type.id, (existingType) => {
      const [draggedElement] = existingType.elements.splice(draggedIndex, 1);
      if (draggedElement) {
        existingType.elements.splice(dropIndex, 0, draggedElement);
      }
    });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className={containerStyle}>
      <div>
        <div className={headerTitleStyle}>Type</div>
      </div>

      <div>
        <div className={fieldLabelStyle}>Name</div>
        <Tooltip content={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}>
          <input
            type="text"
            value={type.name}
            onChange={(event) => {
              updateType(type.id, (existingType) => {
                existingType.name = event.target.value;
              });
            }}
            disabled={isDisabled}
            className={inputStyle({ isDisabled })}
          />
        </Tooltip>
      </div>

      <div>
        <div className={fieldLabelStyle}>Color</div>
        <Tooltip content={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}>
          <ColorSelect
            value={type.displayColor}
            onChange={(color) => {
              updateType(type.id, (existingType) => {
                existingType.displayColor = color;
              });
            }}
            disabled={isDisabled}
          />
        </Tooltip>
      </div>

      {/* Dimensions Section - Editable with drag-to-reorder */}
      <div>
        <div className={dimensionsHeaderStyle}>
          <div className={dimensionsLabelStyle}>
            Dimensions
            <span className={dimensionsHintStyle}>(order matters)</span>
          </div>
          <Tooltip
            content={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          >
            <button
              type="button"
              onClick={handleAddElement}
              disabled={isDisabled}
              className={addDimensionButtonStyle({ isDisabled })}
              aria-label="Add dimension"
            >
              +
            </button>
          </Tooltip>
        </div>

        {type.elements.length === 0 ? (
          <div className={emptyDimensionsStyle}>
            No dimensions defined. Click + to add.
          </div>
        ) : (
          <div className={dimensionsListStyle}>
            {type.elements.map((element, index) => (
              <div
                key={element.elementId}
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
                className={dimensionRowStyle({
                  isDragged: draggedIndex === index,
                  isDragOver: dragOverIndex === index && draggedIndex !== index,
                })}
              >
                {/* Drag handle */}
                <div className={dragHandleStyle({ isDisabled })}>
                  <div className={dragHandleLineStyle} />
                  <div className={dragHandleLineStyle} />
                  <div className={dragHandleLineStyle} />
                </div>

                {/* Index chip */}
                <div className={indexChipStyle}>{index}</div>

                {/* Name input */}
                <Tooltip
                  content={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                >
                  <input
                    type="text"
                    value={element.name}
                    onChange={(event) => {
                      handleUpdateElementName(
                        element.elementId,
                        event.target.value,
                      );
                    }}
                    onBlur={(event) => {
                      handleBlurElementName(
                        element.elementId,
                        event.target.value,
                      );
                    }}
                    disabled={isDisabled}
                    placeholder="dimension_name"
                    className={dimensionNameInputStyle({ isDisabled })}
                  />
                </Tooltip>

                {/* Delete button */}
                <Tooltip
                  content={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                >
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteElement(element.elementId, element.name);
                    }}
                    disabled={isDisabled || type.elements.length === 1}
                    className={deleteDimensionButtonStyle}
                    aria-label={`Delete dimension ${element.name}`}
                  >
                    ×
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
