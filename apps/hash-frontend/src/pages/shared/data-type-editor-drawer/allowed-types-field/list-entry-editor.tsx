import { Box } from "@mui/material";

import {
  Button,
  Form,
  NumberInput,
  ReorderableList,
  SegmentedControl,
  Select,
  TextInput,
} from "@hashintel/ds-components";

import {
  defaultListElement,
  listItemTypeLabels,
  type ListConfig,
  type ListElement,
  type ListItemType,
} from "../shared/list-config";

import type { SelectItem } from "@hashintel/ds-components";

const itemTypeOptions = (
  Object.entries(listItemTypeLabels) as [ListItemType, string][]
).map(([value, label]) => ({ value, label }));

const elementTypeItems: SelectItem<ListItemType>[] = itemTypeOptions.map(
  ({ value, label }) => ({ value, text: label }),
);

// Wide enough that the "Label before"/"Label after" placeholders aren't cropped
const elementLabelInputWidth = 144;

const FlexibleItemsEditor = ({
  config,
  onChange,
  readonly,
}: {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
  readonly?: boolean;
}) => (
  <Form.Row align="center">
    <Form.Field label="Item type" layout="inline" size="sm">
      <Select<ListItemType>
        items={elementTypeItems}
        value={config.itemType}
        onChange={(itemType) => onChange({ ...config, itemType })}
        disabled={readonly}
        size="sm"
        width="xs"
      />
    </Form.Field>
    <Form.Field label="Minimum items" layout="inline" size="sm">
      <NumberInput
        value={config.minItems}
        onChange={(minItems) => onChange({ ...config, minItems })}
        placeholder="No minimum"
        disabled={readonly}
        size="sm"
        width="xs"
      />
    </Form.Field>
    <Form.Field label="Maximum items" layout="inline" size="sm">
      <NumberInput
        value={config.maxItems}
        onChange={(maxItems) => onChange({ ...config, maxItems })}
        placeholder="No maximum"
        disabled={readonly}
        size="sm"
        width="xs"
      />
    </Form.Field>
  </Form.Row>
);

const FixedElementsEditor = ({
  config,
  onChange,
  readonly,
}: {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
  readonly?: boolean;
}) => {
  const setElement = (index: number, element: Partial<ListElement>) => {
    onChange({
      ...config,
      elements: config.elements.map((existing, elementIndex) =>
        elementIndex === index ? { ...existing, ...element } : existing,
      ),
    });
  };

  return (
    <>
      <ReorderableList
        disabled={readonly}
        onChange={(orderedKeys) =>
          onChange({
            ...config,
            elements: orderedKeys.flatMap((key) => {
              const element = config.elements.find((item) => item.key === key);
              return element ? [element] : [];
            }),
          })
        }
      >
        {config.elements.map((element, index) => (
          <ReorderableList.Item
            key={element.key}
            id={element.key}
            label={`element ${index + 1}`}
          >
            <Box sx={{ width: elementLabelInputWidth, flexShrink: 0 }}>
              <TextInput
                value={element.before}
                onChange={(before) => setElement(index, { before })}
                placeholder="Label before"
                disabled={readonly}
                size="sm"
                width="fullWidth"
              />
            </Box>
            <Select<ListItemType>
              items={elementTypeItems}
              value={element.type}
              onChange={(type) => setElement(index, { type })}
              required
              disabled={readonly}
              size="sm"
              width="fitContent"
            />
            <Box sx={{ width: elementLabelInputWidth, flexShrink: 0 }}>
              <TextInput
                value={element.after}
                onChange={(after) => setElement(index, { after })}
                placeholder="Label after"
                disabled={readonly}
                size="sm"
                width="fullWidth"
              />
            </Box>
            {readonly ? null : (
              <Box sx={{ marginLeft: "auto" }}>
                <Button
                  variant="ghost"
                  size="xs"
                  iconName="close"
                  tooltip="Remove element"
                  onClick={() =>
                    onChange({
                      ...config,
                      elements: config.elements.filter(
                        (item) => item.key !== element.key,
                      ),
                    })
                  }
                />
              </Box>
            )}
          </ReorderableList.Item>
        ))}
      </ReorderableList>
      {readonly ? null : (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="subtle"
            size="xs"
            iconName="plus"
            onClick={() =>
              onChange({
                ...config,
                elements: [
                  ...config.elements,
                  defaultListElement(config.elements),
                ],
              })
            }
          >
            Add
          </Button>
        </Box>
      )}
    </>
  );
};

export const ListEntryEditor = ({
  config,
  onChange,
  readonly,
}: {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
  /** Show the list configuration without allowing changes */
  readonly?: boolean;
}) => (
  <Box
    sx={{
      borderTop: "1px solid #f3f3f3",
      background: "#fafafa",
      padding: "10px 10px 12px 26px",
      display: "flex",
      flexDirection: "column",
      gap: 1,
    }}
  >
    <Box>
      <SegmentedControl<ListConfig["shape"]>
        items={[
          { value: "flexible", label: "Flexible" },
          { value: "fixed", label: "Fixed" },
        ]}
        value={config.shape}
        onChange={(shape) => onChange({ ...config, shape })}
        disabled={readonly}
        size="sm"
      />
    </Box>
    {config.shape === "flexible" ? (
      <FlexibleItemsEditor
        config={config}
        onChange={onChange}
        readonly={readonly}
      />
    ) : (
      <FixedElementsEditor
        config={config}
        onChange={onChange}
        readonly={readonly}
      />
    )}
  </Box>
);
