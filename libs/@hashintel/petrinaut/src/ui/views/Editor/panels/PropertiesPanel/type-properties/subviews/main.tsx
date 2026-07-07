import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

import {
  Button,
  Select,
  TextInput,
  Tooltip,
  type SelectItem,
} from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import {
  validateDisplayName,
  type ColorElementType,
} from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { Section, SectionList } from "../../../../../../components/section";
import { TokenTypeIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { ColorSelect } from "../color-select";
import { useTypePropertiesContext } from "../context";

import type { SubView } from "../../../../../../components/sub-view/types";

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
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  overflow: "hidden",
});

const dimensionRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    padding: "1",
    paddingLeft: "2",
    transition: "[all 0.15s ease]",
  },
  variants: {
    isDragged: {
      true: {
        backgroundColor: "blue.bg.min",
      },
      false: {
        backgroundColor: "neutral.a20",
      },
    },
    isDragOver: {
      true: {
        backgroundColor: "blue.bg.min",
        outlineWidth: "[1px]",
        outlineStyle: "dashed",
        outlineColor: "blue.s50",
        outlineOffset: "[-1px]",
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

const dimensionFieldGroupStyle = css({
  display: "flex",
  alignItems: "center",
  flex: "[1]",
  minWidth: "[0]",
});

const dimensionNameInputStyle = css({
  display: "flex",
  flex: "[1]",
  minWidth: "[0]",

  "& input": {
    fontFamily: "mono",
  },
});

const dimensionTypeSelectStyle = css({
  width: "[96px]",
  flexShrink: 0,
});

const deleteDimensionButtonStyle = css({
  color: "neutral.s90",

  "&:not([aria-disabled=true]):is(:hover, :focus-visible)": {
    background: "red.a25",
    borderColor: "red.a70",
    color: "red.s105",
  },

  "&:focus-visible": {
    outlineColor: "red.a60",
  },
});

type ElementNameInputState = Record<
  string,
  { sourceName: string; value: string }
>;

const typeOptions: SelectItem<ColorElementType>[] = [
  { value: "real", text: "Real" },
  { value: "integer", text: "Integer" },
  { value: "boolean", text: "Boolean" },
];

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
  const {
    type,
    updateType,
    addTypeElement,
    updateTypeElement,
    removeTypeElement,
    moveTypeElement,
  } = useTypePropertiesContext();
  const isDisabled = useIsReadOnly();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [elementNameInputs, setElementNameInputs] =
    useState<ElementNameInputState>({});

  const getElementNameInputValue = (
    element: (typeof type.elements)[number],
  ): string => {
    const input = elementNameInputs[element.elementId];
    return input?.sourceName === element.name ? input.value : element.name;
  };

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
    addTypeElement({
      typeId: type.id,
      element: newElement,
    });
  };

  const handleUpdateElementName = (elementId: string, newName: string) => {
    const element = type.elements.find((item) => item.elementId === elementId);
    if (!element) {
      return;
    }
    setElementNameInputs((currentInputs) => ({
      ...currentInputs,
      [elementId]: { sourceName: element.name, value: newName },
    }));
  };

  const setElementNameInput = (elementId: string, name: string) => {
    const element = type.elements.find((item) => item.elementId === elementId);
    if (!element) {
      return;
    }
    setElementNameInputs((currentInputs) => ({
      ...currentInputs,
      [elementId]: { sourceName: element.name, value: name },
    }));
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

    setElementNameInput(elementId, slugifiedName);

    const element = type.elements.find((item) => item.elementId === elementId);

    if (element?.name !== slugifiedName) {
      updateTypeElement({
        typeId: type.id,
        elementId,
        update: { name: slugifiedName },
      });
    }
  };

  const handleDeleteElement = (elementId: string) => {
    removeTypeElement({
      typeId: type.id,
      elementId,
    });
  };

  const handleUpdateElementType = (
    elementId: string,
    elementType: ColorElementType,
  ) => {
    updateTypeElement({
      typeId: type.id,
      elementId,
      update: { type: elementType },
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

    const draggedElement = type.elements[draggedIndex];
    if (draggedElement) {
      moveTypeElement({
        typeId: type.id,
        elementId: draggedElement.elementId,
        toIndex: dropIndex,
      });
    }
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
        <DraftFieldInput
          sourceId={type.id}
          sourceValue={type.name}
          validate={validateDisplayName}
          onCommit={(name) =>
            updateType({
              typeId: type.id,
              update: { name },
            })
          }
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Section>

      <Section title="Color">
        <Tooltip
          content={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : ""}
          disableTooltip={!isDisabled}
        >
          <ColorSelect
            value={type.displayColor}
            onChange={(color) => {
              updateType({
                typeId: type.id,
                update: { displayColor: color },
              });
            }}
            disabled={isDisabled}
          />
        </Tooltip>
      </Section>

      <Section
        title="Dimensions"
        tooltip="A type is an ordered tuple of token attributes. Real attributes can be updated by dynamics; integer and boolean attributes are discrete."
        renderHeaderAction={() => (
          <Button
            onClick={handleAddElement}
            disabled={isDisabled}
            size="xs"
            variant="ghost"
            aria-label="Add dimension"
            tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : "Add dimension"}
            iconName="plus"
          />
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

                <div className={dimensionFieldGroupStyle}>
                  <Tooltip
                    content={UI_MESSAGES.READ_ONLY_MODE}
                    disableTooltip={!isDisabled}
                    className={dimensionNameInputStyle}
                  >
                    <TextInput
                      value={getElementNameInputValue(element)}
                      size="sm"
                      width="fullWidth"
                      onChange={(name) => {
                        handleUpdateElementName(element.elementId, name);
                      }}
                      onBlur={(event) => {
                        handleBlurElementName(
                          element.elementId,
                          event.target.value,
                        );
                      }}
                      disabled={isDisabled}
                      placeholder="dimension_name"
                      connectToRightInput
                    />
                  </Tooltip>

                  <Tooltip
                    content={UI_MESSAGES.READ_ONLY_MODE}
                    disableTooltip={!isDisabled}
                  >
                    <Select
                      required
                      value={element.type}
                      onChange={(value) => {
                        handleUpdateElementType(element.elementId, value);
                      }}
                      items={typeOptions}
                      disabled={isDisabled}
                      size="sm"
                      className={dimensionTypeSelectStyle}
                      connectToLeftInput
                    />
                  </Tooltip>
                </div>

                {/* Delete button */}
                <Button
                  onClick={() => {
                    handleDeleteElement(element.elementId);
                  }}
                  disabled={isDisabled || type.elements.length === 1}
                  size="xxs"
                  variant="ghost"
                  className={deleteDimensionButtonStyle}
                  aria-label={`Delete dimension ${element.name}`}
                  tooltip={
                    isDisabled
                      ? UI_MESSAGES.READ_ONLY_MODE
                      : `Delete dimension ${element.name}`
                  }
                  iconName="close"
                />
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
