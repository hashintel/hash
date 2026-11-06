import type {
  ArrayItemsSchema,
  ArraySchema,
  BaseUrl,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * The List data type is a type-fetcher predefined type and may not be loaded
 * in the graph yet, so its identity is known statically.
 *
 * @see libs/@local/graph/type-fetcher/predefined_types/data_types/list_v1.json
 */
export const listDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/list/v/1" as VersionedUrl;
export const listDataTypeBaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/data-type/list/" as BaseUrl;
export const listDataTypeTitle = "List";
export const listDataTypeDescription = "An ordered list of values";

export type ListItemType = "string" | "number" | "boolean";

export const listItemTypeLabels: Record<ListItemType, string> = {
  string: "Text",
  number: "Number",
  boolean: "Boolean",
};

export type ListElement = {
  before: string;
  type: ListItemType;
  after: string;
};

export type ListConfig = {
  shape: "flexible" | "fixed";
  /** Flexible shape: the single item schema the type system supports, or null for any value */
  itemType: ListItemType | null;
  /** Flexible shape: length bounds, each null when unconstrained */
  minItems: number | null;
  maxItems: number | null;
  /** Fixed shape: one entry per element, with labels shown before/after the value */
  elements: ListElement[];
};

export const defaultListElement = (): ListElement => ({
  before: "",
  type: "number",
  after: "",
});

export const defaultListConfig = (): ListConfig => ({
  shape: "flexible",
  itemType: null,
  minItems: null,
  maxItems: null,
  elements: [defaultListElement()],
});

const itemSchemaForType = (type: ListItemType): ArrayItemsSchema =>
  type === "string"
    ? { type: "string" }
    : type === "number"
      ? { type: "number" }
      : { type: "boolean" };

export const arraySchemaFromListConfig = (
  config: ListConfig,
): { type: "array" } & ArraySchema => {
  if (config.shape === "fixed") {
    const prefixItems = config.elements.map((element): ArrayItemsSchema => {
      const label = {
        ...(element.before ? { left: element.before } : {}),
        ...(element.after ? { right: element.after } : {}),
      };

      return {
        ...itemSchemaForType(element.type),
        ...(Object.keys(label).length > 0 ? { label } : {}),
      };
    });

    return {
      type: "array",
      items: false,
      ...(prefixItems.length > 0
        ? {
            prefixItems: prefixItems as [
              ArrayItemsSchema,
              ...ArrayItemsSchema[],
            ],
          }
        : {}),
    };
  }

  return {
    type: "array",
    ...(config.itemType ? { items: itemSchemaForType(config.itemType) } : {}),
    ...(config.minItems !== null ? { minItems: config.minItems } : {}),
    ...(config.maxItems !== null ? { maxItems: config.maxItems } : {}),
  };
};

export const listConfigFromArraySchema = (schema: ArraySchema): ListConfig => {
  if ("items" in schema && schema.items === false) {
    const elements = (schema.prefixItems ?? []).map((item): ListElement => ({
      before: item.label?.left ?? "",
      type: item.type,
      after: item.label?.right ?? "",
    }));

    return {
      shape: "fixed",
      itemType: null,
      minItems: null,
      maxItems: null,
      elements: elements.length > 0 ? elements : [defaultListElement()],
    };
  }

  return {
    shape: "flexible",
    itemType: schema.items?.type ?? null,
    minItems: schema.minItems ?? null,
    maxItems: schema.maxItems ?? null,
    elements: [defaultListElement()],
  };
};
