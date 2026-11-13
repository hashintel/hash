import { Box, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  Button,
  Combobox,
  Form,
  NumberInput,
  ReorderableList,
  SegmentedControl,
  Select,
  TextInput,
} from "@hashintel/ds-components";

import { useDataTypesContext } from "../../data-types-context";
import { AddConstraintMenu, ConstraintsField } from "../constraints-field";
import {
  activeConstraintKinds,
  constraintValuesFromSchema,
  deriveInheritedConstraints,
  emptyInheritedConstraints,
  schemaConstraintsFromValues,
  visibleConstraintKinds,
} from "../shared/constraint-config";
import {
  defaultListElement,
  itemSchemaForType,
  listItemTypeLabels,
  type ListConfig,
  type ListElement,
  type ListItemType,
} from "../shared/list-config";
import { primitiveRootTypeByBaseUrl } from "../shared/primitive-root-types";

import type { ConstraintsState } from "../constraints-field";
import type {
  ArrayItemsSchema,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ComboboxItem, SelectItem } from "@hashintel/ds-components";

const itemTypeOptions = (
  Object.entries(listItemTypeLabels) as [ListItemType, string][]
).map(([value, label]) => ({ value, label }));

/**
 * A pseudo option under the item types: picking it opens the copy panel
 * instead of setting a type, which happens when a source type is chosen there
 */
const copyFromTypeOptionValue = "copy-from-type";

type ItemTypeSelectValue = ListItemType | typeof copyFromTypeOptionValue;

const itemTypeSelectItems: SelectItem<ItemTypeSelectValue>[] = [
  ...itemTypeOptions.map(({ value, label }) => ({ value, text: label })),
  {
    value: copyFromTypeOptionValue,
    text: "Copy from another data type",
  },
];

// Wide enough that the "Label before"/"Label after" placeholders aren't cropped
const elementLabelInputWidth = 144;

const emptyConstraints: ConstraintsState = { activeKinds: [], values: {} };

/** The constraint-state key for the flexible shape's single item schema */
const flexibleKey = "items";

const stateFromItemSchema = (
  item: ArrayItemsSchema | undefined,
): ConstraintsState => {
  if (!item) {
    return emptyConstraints;
  }
  const values = constraintValuesFromSchema(item);
  return { activeKinds: activeConstraintKinds(values), values };
};

/** The item schema a type + constraint state saves as, keeping a loaded label */
const itemSchemaFromState = (
  type: ListItemType,
  state: ConstraintsState,
  previous: ArrayItemsSchema | undefined,
): ArrayItemsSchema => ({
  ...itemSchemaForType(type),
  ...(previous?.label ? { label: previous.label } : {}),
  ...schemaConstraintsFromValues({
    primitive: type,
    activeKinds: state.activeKinds,
    values: state.values,
  }),
});

const itemVisibleKinds = (type: ListItemType, state: ConstraintsState) =>
  visibleConstraintKinds({
    primitive: type,
    activeKinds: state.activeKinds,
    inheritedValues: emptyInheritedConstraints.values,
  });

const constraintsSectionLabelSx = {
  fontSize: 14,
  fontWeight: 600,
  color: "#404040",
} as const;

const addConstraintTrigger = (
  <Button variant="ghost" size="sm" iconName="plus">
    Add constraint
  </Button>
);

/** The compact variant for fixed-length item rows and their sections */
const addConstraintTriggerXs = (
  <Button variant="ghost" size="xs" iconName="plus">
    Add constraint
  </Button>
);

const FlexibleItemsEditor = ({
  config,
  onChange,
  constraints,
  onConstraintsChange,
  onItemTypeChange,
  onRequestCopyFromType,
  copyFromTypePanel,
  readonly,
}: {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
  constraints: ConstraintsState;
  onConstraintsChange: (state: ConstraintsState) => void;
  onItemTypeChange: (itemType: ListItemType | null) => void;
  onRequestCopyFromType: () => void;
  copyFromTypePanel: React.ReactNode;
  readonly?: boolean;
}) => (
  <>
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
      }}
    >
      <Form.Field label="Item type" layout="inline" size="sm">
        <Select<ItemTypeSelectValue>
          items={itemTypeSelectItems}
          value={config.itemType}
          onChange={(value) => {
            if (value === copyFromTypeOptionValue) {
              onRequestCopyFromType();
            } else {
              onItemTypeChange(value);
            }
          }}
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
    </Box>
    {copyFromTypePanel}
    {config.itemType &&
    itemVisibleKinds(config.itemType, constraints).length > 0 ? (
      <Box
        sx={{
          // A full-bleed band in a shade lighter than the inset grey: the
          // negative margins undo the editor's own padding so it runs to the
          // card's edges and bottom, re-padded to keep content aligned
          background: "#fdfdfd",
          borderTop: "1px solid #f0f0f0",
          margin: "0 -10px -12px -26px",
          padding: "10px 10px 12px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography sx={constraintsSectionLabelSx}>Constraints</Typography>
          {readonly ? null : (
            <AddConstraintMenu
              primitive={config.itemType}
              inherited={emptyInheritedConstraints}
              state={constraints}
              onChange={onConstraintsChange}
              trigger={addConstraintTrigger}
            />
          )}
        </Box>
        <ConstraintsField
          primitive={config.itemType}
          inherited={emptyInheritedConstraints}
          state={constraints}
          onChange={onConstraintsChange}
          childTypeTitles={[]}
          readonly={readonly}
        />
      </Box>
    ) : null}
  </>
);

const FixedElementsEditor = ({
  config,
  onChange,
  constraintStateFor,
  onElementConstraintsChange,
  onElementTypeChange,
  onRequestCopyFromType,
  copyFromTypePanelFor,
  readonly,
}: {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
  constraintStateFor: (element: ListElement) => ConstraintsState;
  onElementConstraintsChange: (
    index: number,
    element: ListElement,
    state: ConstraintsState,
  ) => void;
  onElementTypeChange: (
    index: number,
    element: ListElement,
    type: ListItemType,
  ) => void;
  onRequestCopyFromType: (elementKey: string) => void;
  copyFromTypePanelFor: (elementKey: string) => React.ReactNode;
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
    <ReorderableList
      disabled={readonly}
      // Items grow a constraints section beneath the inputs row; the grip
      // stays with the row rather than floating between the two
      handleAlign="start"
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
      {config.elements.map((element, index) => {
        const constraints = constraintStateFor(element);
        const hasConstraintsSection =
          itemVisibleKinds(element.type, constraints).length > 0;

        return (
          <ReorderableList.Item
            key={element.key}
            id={element.key}
            label={`element ${index + 1}`}
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
                <Select<ItemTypeSelectValue>
                  items={itemTypeSelectItems}
                  value={element.type}
                  onChange={(value) => {
                    if (value === copyFromTypeOptionValue) {
                      onRequestCopyFromType(element.key);
                    } else {
                      onElementTypeChange(index, element, value);
                    }
                  }}
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
                  <Box
                    sx={{
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.25,
                    }}
                  >
                    {/* Once a constraint exists the action lives in the
                        Constraints section's own header instead */}
                    {hasConstraintsSection ? null : (
                      <AddConstraintMenu
                        primitive={element.type}
                        inherited={emptyInheritedConstraints}
                        state={constraints}
                        onChange={(state) =>
                          onElementConstraintsChange(index, element, state)
                        }
                        trigger={addConstraintTriggerXs}
                      />
                    )}
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
              </Box>
              {copyFromTypePanelFor(element.key)}
              {hasConstraintsSection ? (
                <Box
                  sx={{
                    borderTop: "1px solid #ededed",
                    paddingTop: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.25,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                    }}
                  >
                    <Typography sx={constraintsSectionLabelSx}>
                      Constraints
                    </Typography>
                    {readonly ? null : (
                      <AddConstraintMenu
                        primitive={element.type}
                        inherited={emptyInheritedConstraints}
                        state={constraints}
                        onChange={(state) =>
                          onElementConstraintsChange(index, element, state)
                        }
                        trigger={addConstraintTriggerXs}
                      />
                    )}
                  </Box>
                  <ConstraintsField
                    primitive={element.type}
                    inherited={emptyInheritedConstraints}
                    state={constraints}
                    onChange={(state) =>
                      onElementConstraintsChange(index, element, state)
                    }
                    childTypeTitles={[]}
                    readonly={readonly}
                  />
                </Box>
              ) : null}
            </Box>
          </ReorderableList.Item>
        );
      })}
    </ReorderableList>
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
}) => {
  const { dataTypes, latestDataTypes } = useDataTypesContext();

  /**
   * Constraint rows per item ("items" for the flexible shape, the element key
   * for fixed elements). The saved truth is the item schema on the config;
   * this state additionally keeps kinds that were added but hold no value
   * yet, which the schema can't express.
   */
  const [constraintStates, setConstraintStates] = useState<
    Record<string, ConstraintsState>
  >({});

  /** The item ("items" or an element key) the copy panel is open for */
  const [copyPickerFor, setCopyPickerFor] = useState<string | null>(null);

  useEffect(() => {
    if (copyPickerFor === null) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;

      if (
        target?.closest("[data-copy-from-type-picker]") ??
        target?.closest('[data-scope="combobox"]')
      ) {
        return;
      }

      setCopyPickerFor(null);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [copyPickerFor]);

  const resolveDataType = useCallback(
    (dataTypeId: VersionedUrl) =>
      dataTypes?.[dataTypeId] ?? latestDataTypes?.[extractBaseUrl(dataTypeId)],
    [dataTypes, latestDataTypes],
  );

  /**
   * Types an item can copy from: concrete descendants of the Text and Number
   * roots. Boolean is skipped — it has no constraints to copy — and the roots
   * themselves add nothing beyond the primitive.
   */
  const copyCandidates = useMemo((): ComboboxItem<VersionedUrl>[] => {
    return Object.values(latestDataTypes ?? {})
      .filter((dataType) => {
        if (
          primitiveRootTypeByBaseUrl.has(dataType.metadata.recordId.baseUrl)
        ) {
          return false;
        }
        const { schema } = dataType;
        const primitive = "anyOf" in schema ? null : schema.type;
        return primitive === "string" || primitive === "number";
      })
      .sort((a, b) => a.schema.title.localeCompare(b.schema.title))
      .map((dataType) => ({
        value: dataType.schema.$id,
        text: dataType.schema.title,
      }));
  }, [latestDataTypes]);

  /**
   * Copy: the item takes the source's primitive, its effective constraints
   * (its own and everything it inherits), and its value labels
   */
  const applyCopyFromType = (key: string, dataTypeId: VersionedUrl) => {
    const source = resolveDataType(dataTypeId);
    if (!source) {
      return;
    }

    const { schema } = source;
    const primitive = "anyOf" in schema ? null : schema.type;
    if (primitive !== "string" && primitive !== "number") {
      return;
    }

    const sourceLabel = schema.label;

    const { values } = deriveInheritedConstraints({
      parentDataTypeIds: [dataTypeId],
      resolveDataType,
    });
    const state: ConstraintsState = {
      activeKinds: activeConstraintKinds(values),
      values,
    };
    const item = itemSchemaFromState(primitive, state, undefined);

    setConstraintStates((previous) => ({ ...previous, [key]: state }));
    setCopyPickerFor(null);

    if (key === flexibleKey) {
      onChange({
        ...config,
        itemType: primitive,
        sourceItems: {
          ...item,
          ...(sourceLabel ? { label: sourceLabel } : {}),
        },
      });
    } else {
      // Fixed-shape labels live on the element's before/after inputs; the
      // save path rebuilds the item label from those
      onChange({
        ...config,
        elements: config.elements.map((existing) =>
          existing.key === key
            ? {
                ...existing,
                type: primitive,
                sourceItem: item,
                before: sourceLabel?.left ?? "",
                after: sourceLabel?.right ?? "",
              }
            : existing,
        ),
      });
    }
  };

  const copyFromTypePanelFor = (key: string) =>
    copyPickerFor === key ? (
      <Box
        data-copy-from-type-picker
        sx={{ display: "flex", alignItems: "center", gap: 1 }}
      >
        <Typography sx={{ fontSize: 13, color: "#525252", flexShrink: 0 }}>
          Copy from
        </Typography>
        <Box sx={{ flex: 1, maxWidth: 320 }}>
          <Combobox<VersionedUrl>
            items={copyCandidates}
            value={null}
            onChange={(dataTypeId) => {
              if (dataTypeId) {
                applyCopyFromType(key, dataTypeId);
              }
            }}
            placeholder="Search data types…"
            size="sm"
            width="fullWidth"
          />
        </Box>
      </Box>
    ) : null;

  const itemsConstraints =
    constraintStates[flexibleKey] ?? stateFromItemSchema(config.sourceItems);

  const handleItemsConstraintsChange = (state: ConstraintsState) => {
    setConstraintStates((previous) => ({ ...previous, [flexibleKey]: state }));
    onChange({
      ...config,
      sourceItems: config.itemType
        ? itemSchemaFromState(config.itemType, state, config.sourceItems)
        : undefined,
    });
  };

  // A new item type starts unconstrained: the old type's constraints don't
  // transfer across primitives
  const handleItemTypeChange = (itemType: ListItemType | null) => {
    setConstraintStates((previous) => ({
      ...previous,
      [flexibleKey]: emptyConstraints,
    }));
    onChange({ ...config, itemType, sourceItems: undefined });
  };

  const constraintStateFor = (element: ListElement) =>
    constraintStates[element.key] ?? stateFromItemSchema(element.sourceItem);

  const handleElementConstraintsChange = (
    index: number,
    element: ListElement,
    state: ConstraintsState,
  ) => {
    setConstraintStates((previous) => ({ ...previous, [element.key]: state }));
    onChange({
      ...config,
      elements: config.elements.map((existing, elementIndex) =>
        elementIndex === index
          ? {
              ...existing,
              sourceItem: itemSchemaFromState(
                element.type,
                state,
                element.sourceItem,
              ),
            }
          : existing,
      ),
    });
  };

  const handleElementTypeChange = (
    index: number,
    element: ListElement,
    type: ListItemType,
  ) => {
    setConstraintStates((previous) => ({
      ...previous,
      [element.key]: emptyConstraints,
    }));
    onChange({
      ...config,
      elements: config.elements.map((existing, elementIndex) =>
        elementIndex === index
          ? { ...existing, type, sourceItem: undefined }
          : existing,
      ),
    });
  };

  return (
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
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <SegmentedControl<ListConfig["shape"]>
          items={[
            { value: "flexible", label: "Variable length" },
            { value: "fixed", label: "Fixed length" },
          ]}
          value={config.shape}
          onChange={(shape) => onChange({ ...config, shape })}
          disabled={readonly}
          size="sm"
        />
        {readonly ? null : config.shape === "flexible" ? (
          // Once a constraint exists the action lives in the Constraints
          // section's own header instead
          config.itemType &&
          itemVisibleKinds(config.itemType, itemsConstraints).length === 0 ? (
            <AddConstraintMenu
              primitive={config.itemType}
              inherited={emptyInheritedConstraints}
              state={itemsConstraints}
              onChange={handleItemsConstraintsChange}
              trigger={addConstraintTrigger}
            />
          ) : null
        ) : (
          <Button
            variant="subtle"
            size="sm"
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
            Add item
          </Button>
        )}
      </Box>
      {config.shape === "flexible" ? (
        <FlexibleItemsEditor
          config={config}
          onChange={onChange}
          constraints={itemsConstraints}
          onConstraintsChange={handleItemsConstraintsChange}
          onItemTypeChange={handleItemTypeChange}
          onRequestCopyFromType={() => setCopyPickerFor(flexibleKey)}
          copyFromTypePanel={copyFromTypePanelFor(flexibleKey)}
          readonly={readonly}
        />
      ) : (
        <FixedElementsEditor
          config={config}
          onChange={onChange}
          constraintStateFor={constraintStateFor}
          onElementConstraintsChange={handleElementConstraintsChange}
          onElementTypeChange={handleElementTypeChange}
          onRequestCopyFromType={(elementKey) => setCopyPickerFor(elementKey)}
          copyFromTypePanelFor={copyFromTypePanelFor}
          readonly={readonly}
        />
      )}
    </Box>
  );
};
