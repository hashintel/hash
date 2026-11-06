import { Box } from "@mui/material";

import {
  Button,
  Form,
  NumberInput,
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
}: {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
}) => (
  <Form.Row align="center">
    <Form.Field label="Item type" layout="inline" size="sm">
      <Select<ListItemType>
        items={elementTypeItems}
        value={config.itemType}
        onChange={(itemType) => onChange({ ...config, itemType })}
        size="sm"
        width="xs"
      />
    </Form.Field>
    <Form.Field label="Minimum items" layout="inline" size="sm">
      <NumberInput
        value={config.minItems}
        onChange={(minItems) => onChange({ ...config, minItems })}
        placeholder="No minimum"
        size="sm"
        width="xs"
      />
    </Form.Field>
    <Form.Field label="Maximum items" layout="inline" size="sm">
      <NumberInput
        value={config.maxItems}
        onChange={(maxItems) => onChange({ ...config, maxItems })}
        placeholder="No maximum"
        size="sm"
        width="xs"
      />
    </Form.Field>
  </Form.Row>
);

const FixedElementsEditor = ({
  config,
  onChange,
}: {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
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
      {config.elements.map((element, index) => (
        <Box
          // eslint-disable-next-line react/no-array-index-key -- elements have no identity beyond position
          key={index}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            background: "white",
            border: ({ palette }) => `1px solid ${palette.gray[30]}`,
            borderRadius: "10px",
            padding: "6px",
          }}
        >
          <Box sx={{ width: elementLabelInputWidth, flexShrink: 0 }}>
            <TextInput
              value={element.before}
              onChange={(before) => setElement(index, { before })}
              placeholder="Label before"
              size="sm"
              width="fullWidth"
            />
          </Box>
          <Select<ListItemType>
            items={elementTypeItems}
            value={element.type}
            onChange={(type) => setElement(index, { type })}
            required
            size="sm"
            width="fitContent"
          />
          <Box sx={{ width: elementLabelInputWidth, flexShrink: 0 }}>
            <TextInput
              value={element.after}
              onChange={(after) => setElement(index, { after })}
              placeholder="Label after"
              size="sm"
              width="fullWidth"
            />
          </Box>
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
                    (_, elementIndex) => elementIndex !== index,
                  ),
                })
              }
            />
          </Box>
        </Box>
      ))}
      <Box>
        <Button
          variant="subtle"
          size="xs"
          iconName="plus"
          onClick={() =>
            onChange({
              ...config,
              elements: [...config.elements, defaultListElement()],
            })
          }
        >
          Add
        </Button>
      </Box>
    </>
  );
};

export const ListEntryEditor = ({
  config,
  onChange,
}: {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
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
        size="sm"
      />
    </Box>
    {config.shape === "flexible" ? (
      <FlexibleItemsEditor config={config} onChange={onChange} />
    ) : (
      <FixedElementsEditor config={config} onChange={onChange} />
    )}
  </Box>
);
