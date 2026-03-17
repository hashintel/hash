import { css, cva } from "@hashintel/ds-helpers/css";
import { useState } from "react";
import { TbPlus, TbX } from "react-icons/tb";
import { v4 as uuidv4 } from "uuid";

import { IconButton } from "../../../../../../components/icon-button";
import { Input } from "../../../../../../components/input";
import { Section, SectionList } from "../../../../../../components/section";
import type { SubView } from "../../../../../../components/sub-view/types";
import { Tooltip } from "../../../../../../components/tooltip";
import { TokenTypeIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { useIsReadOnly } from "../../../../../../state/use-is-read-only";
import { ColorSelect } from "../color-select";
import { useTypePropertiesContext } from "../context";

const emptyDimensionsStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  fontStyle: "italic",
  padding: "2",
  backgroundColor: "neutral.a05",
  borderRadius: "sm",
  textAlign: "center",
});

const dimensionsListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

const dimensionRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    padding: "1",
    paddingLeft: "2",
    borderRadius: "md",
    transition: "[all 0.15s ease]",
  },
  variants: {
    isDragged: {
      true: {
        backgroundColor: "blue.bg.min",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "neutral.bd.subtle",
      },
      false: {
        backgroundColor: "neutral.a20",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "neutral.bd.subtle",
      },
    },
    isDragOver: {
      true: {
        backgroundColor: "blue.bg.min",
        borderWidth: "[1px]",
        borderStyle: "dashed",
        borderColor: "blue.s50",
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
    opacity: "[0.3]",
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
  backgroundColor: "neutral.s105",
});

const indexChipStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s100",
  width: "3",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

const dimensionNameInputStyle = css({
  fontSize: "sm",
  flex: "[1]",
});

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

  const handleDeleteElement = (elementId: string) => {
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
    <SectionList>
      <Section title="Name">
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
      </Section>

      <Section title="Color">
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
      </Section>

      <Section
        title="Dimensions"
        tooltip="A type is an ordered tuple of real-valued dimensions. The index of each dimension determines its position in the token vector."
        renderHeaderAction={() => (
          <IconButton
            onClick={handleAddElement}
            disabled={isDisabled}
            size="xs"
            variant="ghost"
            colorScheme="brand"
            aria-label="Add dimension"
            tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          >
            <TbPlus />
          </IconButton>
        )}
      >
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
                <IconButton
                  onClick={() => {
                    handleDeleteElement(element.elementId);
                  }}
                  disabled={isDisabled || type.elements.length === 1}
                  size="xxs"
                  variant="ghost"
                  colorScheme="red"
                  aria-label={`Delete dimension ${element.name}`}
                  tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
                >
                  <TbX />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Section>
    </SectionList>
  );
};

export const typeMainContentSubView: SubView = {
  id: "type-main-content",
  title: "Type",
  icon: TokenTypeIcon,
  main: true,
  component: TypeMainContent,
};
