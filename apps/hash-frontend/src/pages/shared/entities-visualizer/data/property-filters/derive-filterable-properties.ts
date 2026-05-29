import { getMergedDataTypeSchema } from "@local/hash-isomorphic-utils/data-types";
import { typedEntries } from "@local/advanced-types/typed-entries";

import type { FilterableProperty, FilterValueKind } from "./types";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system";
import type { ClosedMultiEntityTypesDefinitions } from "@local/hash-graph-sdk/ontology";

/**
 * Maps the resolved data type's primitive `type` to a filterable value kind, or
 * `null` for kinds we don't support filtering on in v1 (null, object, array).
 */
const resolveValueKind = (type: string): FilterValueKind | null => {
  switch (type) {
    case "number":
    case "string":
    case "boolean":
      return type;
    default:
      return null;
  }
};

/**
 * Classifies a single property (as it appears on one entity type) into a
 * {@link FilterableProperty}, or `null` if it should be omitted from the picker
 * (a supported-but-unfilterable kind like `null`, or a missing definition).
 */
const classifyProperty = ({
  baseUrl,
  propertySchema,
  definitions,
}: {
  baseUrl: BaseUrl;
  propertySchema: ValueOrArray<PropertyTypeReference>;
  definitions: ClosedMultiEntityTypesDefinitions;
}): FilterableProperty | null => {
  // A property used as a list on the entity type can't be filtered yet.
  const isListAtEntityLevel = "items" in propertySchema;

  const propertyTypeId =
    "$ref" in propertySchema ? propertySchema.$ref : propertySchema.items.$ref;

  const propertyType = definitions.propertyTypes[propertyTypeId];

  if (!propertyType) {
    return null;
  }

  const { title } = propertyType;

  const disabled = (
    disabledReason: Extract<
      FilterableProperty,
      { filterable: false }
    >["disabledReason"]
  ): FilterableProperty => ({
    baseUrl,
    title,
    filterable: false,
    disabledReason,
  });

  if (isListAtEntityLevel) {
    return disabled("list");
  }

  // More than one possible value definition means multiple data types.
  if (propertyType.oneOf.length > 1) {
    return disabled("multiple-data-types");
  }

  const valueDefinition = propertyType.oneOf[0];

  // Not a direct data-type reference: it's either a nested property object or a
  // list of values – neither is filterable in v1.
  if (!("$ref" in valueDefinition)) {
    return disabled(valueDefinition.type === "object" ? "nested" : "list");
  }

  const dataType = definitions.dataTypes[valueDefinition.$ref];

  if (!dataType) {
    return null;
  }

  let kind: FilterValueKind | null;
  try {
    const mergedSchema = getMergedDataTypeSchema(dataType.schema);

    if ("anyOf" in mergedSchema) {
      // The data type permits more than one set of constraints.
      if (mergedSchema.anyOf.length !== 1) {
        return disabled("multiple-data-types");
      }

      kind = resolveValueKind(mergedSchema.anyOf[0]!.type);
    } else {
      kind = resolveValueKind(mergedSchema.type);
    }
  } catch {
    // The data type has a shape `getMergedDataTypeSchema` can't reduce to a
    // single set of constraints (e.g. mixed primitives) – treat it as a
    // multiple-data-types case.
    return disabled("multiple-data-types");
  }

  if (!kind) {
    // A supported single data type, but not a number / string / boolean (e.g.
    // null). Not filterable in v1, and without a dedicated reason – omit it
    // from the picker rather than inventing a tooltip.
    return null;
  }

  return { baseUrl, title, kind, filterable: true };
};

/**
 * Derives the list of properties offered in the property-filter picker from the
 * same closed-entity-type / definitions data that builds the visible table
 * columns ("filter on the columns you see").
 *
 * A property is **filterable** only if all of the following hold:
 * - it is not used as a list/array on the entity type;
 * - its property type has exactly one value definition (`oneOf.length === 1`);
 * - that single definition is a direct data-type reference (not a nested
 *   property object, not a list);
 * - the resolved data type permits exactly one data type; and
 * - that data type resolves to a `number`, `string`, or `boolean` kind.
 *
 * Properties that fail the gate are still returned, but annotated with a
 * {@link FilterableProperty.disabledReason} so the picker can list them disabled
 * with a reason-specific tooltip.
 *
 * When the same property base URL appears across several entity types in
 * different shapes (e.g. a list on one type, a single value on another), the
 * **filterable** interpretation wins, so the user can still filter on the column
 * they see. Among unfilterable interpretations the first encountered wins.
 *
 * Pure function – authored so it can be unit-tested in isolation.
 */
export const deriveFilterableProperties = ({
  closedMultiEntityTypes,
  definitions,
}: {
  closedMultiEntityTypes: ClosedMultiEntityType[];
  definitions: ClosedMultiEntityTypesDefinitions;
}): FilterableProperty[] => {
  const byBaseUrl = new Map<BaseUrl, FilterableProperty>();

  for (const closedMultiEntityType of closedMultiEntityTypes) {
    for (const [baseUrl, propertySchema] of typedEntries(
      closedMultiEntityType.properties
    )) {
      const existing = byBaseUrl.get(baseUrl);

      // Once a property is known to be filterable, nothing can downgrade it.
      if (existing?.filterable) {
        continue;
      }

      const classified = classifyProperty({
        baseUrl,
        propertySchema,
        definitions,
      });

      if (!classified) {
        continue;
      }

      // Prefer a filterable interpretation; otherwise keep the first-seen
      // disabled reason.
      if (!existing || classified.filterable) {
        byBaseUrl.set(baseUrl, classified);
      }
    }
  }

  // Filterable properties first, then unfilterable ones, each group sorted
  // alphabetically by title.
  return Array.from(byBaseUrl.values()).sort((a, b) => {
    if (a.filterable !== b.filterable) {
      return a.filterable ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
};
