import { css, cva } from "@hashintel/ds-helpers/css";
import { createContext, use, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { Button } from "../../../../components/button";
import { Input } from "../../../../components/input";
import type { SubView } from "../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { Tooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import type { Color } from "../../../../core/types/sdcpn";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { ColorSelect } from "./color-select";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const mainContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const fieldLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
  marginBottom: "[4px]",
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
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        color: "[#999]",
      },
      false: {
        backgroundColor: "[rgba(59, 130, 246, 0.1)]",
        color: "[#3b82f6]",
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

const dimensionNameInputStyle = css({
  fontSize: "[13px]",
  padding: "[5px 8px]",
  flex: "1",
});

const deleteDimensionButtonStyle = cva({
  base: {
    fontSize: "[16px]",
    width: "[28px]",
    height: "[28px]",
    borderRadius: "[3px]",
    fontWeight: "semibold",
    lineHeight: "[1]",
    flexShrink: 0,
  },
  variants: {
    isDisabled: {
      true: {
        border: "[1px solid rgba(0, 0, 0, 0.1)]",
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        color: "[#999]",
      },
      false: {
        border: "[1px solid rgba(239, 68, 68, 0.2)]",
        backgroundColor: "[rgba(239, 68, 68, 0.08)]",
        color: "[#ef4444]",
      },
    },
  },
});

// --- Helpers ---

const slugifyToIdentifier = (input: string): string => {
  let slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (/^[0-9]/.test(slug)) {
    slug = `_${slug}`;
  }

  if (slug === "") {
    slug = "field";
  }

  return slug;
};

// --- Context ---

interface TypePropertiesContextValue {
  type: Color;
  updateType: (typeId: string, updateFn: (type: Color) => void) => void;
}

const TypePropertiesContext = createContext<TypePropertiesContextValue | null>(
  null,
);

const useTypePropertiesContext = (): TypePropertiesContextValue => {
  const context = use(TypePropertiesContext);
  if (!context) {
    throw new Error(
      "useTypePropertiesContext must be used within TypeProperties",
    );
  }
  return context;
};

// --- Content ---

const TypeMainContent: React.FC = () => {
  const { type, updateType } = useTypePropertiesContext();
  const isDisabled = useIsReadOnly();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAddElement = () => {
    let maxNumber = 0;
    for (const element of type.elements) {
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
    const slugifiedName = slugifyToIdentifier(currentName);

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
    <div className={mainContentStyle}>
      <div>
        <div className={fieldLabelStyle}>Name</div>
        <Input
          value={type.name}
          onChange={(event) => {
            updateType(type.id, (existingType) => {
              existingType.name = event.target.value;
            });
          }}
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
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
          <Button
            onClick={handleAddElement}
            disabled={isDisabled}
            className={addDimensionButtonStyle({ isDisabled })}
            aria-label="Add dimension"
            tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          >
            +
          </Button>
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
                <Input
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
                  className={dimensionNameInputStyle}
                  tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                />

                {/* Delete button */}
                <Button
                  onClick={() => {
                    handleDeleteElement(element.elementId, element.name);
                  }}
                  disabled={isDisabled || type.elements.length === 1}
                  className={deleteDimensionButtonStyle({
                    isDisabled: isDisabled || type.elements.length === 1,
                  })}
                  aria-label={`Delete dimension ${element.name}`}
                  tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const typeMainContentSubView: SubView = {
  id: "type-main-content",
  title: "Type",
  main: true,
  component: TypeMainContent,
};

const subViews: SubView[] = [typeMainContentSubView];

// --- Export ---

interface TypePropertiesProps {
  type: Color;
  updateType: (typeId: string, updateFn: (type: Color) => void) => void;
}

export const TypeProperties: React.FC<TypePropertiesProps> = ({
  type,
  updateType,
}) => {
  const value = useMemo(() => ({ type, updateType }), [type, updateType]);

  return (
    <div className={containerStyle}>
      <TypePropertiesContext.Provider value={value}>
        <VerticalSubViewsContainer subViews={subViews} />
      </TypePropertiesContext.Provider>
    </div>
  );
};
