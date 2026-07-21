import * as Sentry from "@sentry/nextjs";

import { typedEntries } from "@local/advanced-types/typed-entries";

import type {
  FilterMetadataForProperty,
  FilterValueKind,
} from "./property-filter";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  PropertyTypeReference,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";

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

export const resolveDataTypeValueKind = ({
  dataTypeId,
  dataTypes,
  seenDataTypeIds = new Set(),
}: {
  dataTypeId: VersionedUrl;
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  seenDataTypeIds?: Set<VersionedUrl>;
}): FilterValueKind | "multiple-data-types" | null => {
  if (seenDataTypeIds.has(dataTypeId)) {
    return null;
  }

  const dataType = dataTypes[dataTypeId];

  if (!dataType) {
    Sentry.captureException(
      new Error(
        `Data type not found for ${dataTypeId} when resolving value kind`,
      ),
    );
    return null;
  }

  seenDataTypeIds.add(dataTypeId);

  if ("anyOf" in dataType.schema) {
    // The data type permits more than one set of constraints.
    if (dataType.schema.anyOf.length !== 1) {
      return "multiple-data-types";
    }

    return resolveValueKind(dataType.schema.anyOf[0].type);
  }

  const ownKind =
    "type" in dataType.schema ? resolveValueKind(dataType.schema.type) : null;

  if (ownKind) {
    return ownKind;
  }

  let inheritedKind: FilterValueKind | null = null;

  for (const parentTypeId of dataType.schema.allOf?.map(({ $ref }) => $ref) ??
    []) {
    const parentKind = resolveDataTypeValueKind({
      dataTypeId: parentTypeId,
      dataTypes,
      seenDataTypeIds,
    });

    if (parentKind === "multiple-data-types") {
      return parentKind;
    }

    if (!parentKind) {
      continue;
    }

    if (inheritedKind && inheritedKind !== parentKind) {
      return "multiple-data-types";
    }

    inheritedKind = parentKind;
  }

  return inheritedKind;
};

/**
 * Classifies a single property (as it appears on one entity type) into a
 * {@link FilterMetadataForProperty}, or `null` if it should be omitted from the picker
 * (a supported-but-unfilterable kind like `null`, or a missing definition).
 */
const classifyProperty = ({
  baseUrl,
  propertySchema,
  dataTypes,
  propertyTypes,
}: {
  baseUrl: BaseUrl;
  propertySchema: ValueOrArray<PropertyTypeReference>;
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata>;
}): FilterMetadataForProperty | null => {
  // A property used as a list on the entity type can't be filtered yet.
  const isListAtEntityLevel = "items" in propertySchema;

  const propertyTypeId =
    "$ref" in propertySchema ? propertySchema.$ref : propertySchema.items.$ref;

  const propertyType = propertyTypes[propertyTypeId]?.schema;

  if (!propertyType) {
    return null;
  }

  const { title } = propertyType;

  const disabled = (
    disabledReason: Extract<
      FilterMetadataForProperty,
      { filterable: false }
    >["disabledReason"],
  ): FilterMetadataForProperty => ({
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

  const kind = resolveDataTypeValueKind({
    dataTypeId: valueDefinition.$ref,
    dataTypes,
  });

  if (kind === "multiple-data-types") {
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
 * Derives the list of properties offered in the property-filter picker from all
 * entity types in the result set, not just the entity types present on the
 * currently returned page.
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
 * {@link FilterMetadataForProperty.disabledReason} so the picker can list them disabled
 * with a reason-specific tooltip.
 *
 * When the same property base URL appears across several entity types in
 * different shapes (e.g. a list on one type, a single value on another), the
 * **filterable** interpretation wins, so the user can still filter on the column
 * they see. Among unfilterable interpretations the first encountered wins.
 */
export const deriveFilterableProperties = ({
  dataTypes,
  entityTypeIds,
  entityTypeParentIds,
  entityTypes,
  propertyTypes,
}: {
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  entityTypeIds: VersionedUrl[];
  entityTypeParentIds: Record<VersionedUrl, VersionedUrl[]>;
  entityTypes: EntityTypeWithMetadata[];
  propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata>;
}): FilterMetadataForProperty[] => {
  const byBaseUrl = new Map<BaseUrl, FilterMetadataForProperty>();
  const entityTypesById = new Map(
    entityTypes.map((entityType) => [entityType.schema.$id, entityType]),
  );

  for (const entityTypeId of entityTypeIds) {
    const entityTypeAndParentIds = [
      entityTypeId,
      ...(entityTypeParentIds[entityTypeId] ?? []),
    ];

    for (const entityTypeOrParentId of entityTypeAndParentIds) {
      const entityTypeOrParent = entityTypesById.get(entityTypeOrParentId);

      if (!entityTypeOrParent) {
        continue;
      }

      for (const [baseUrl, propertySchema] of typedEntries(
        entityTypeOrParent.schema.properties,
      )) {
        const existing = byBaseUrl.get(baseUrl);

        // Once a property is known to be filterable, nothing can downgrade it.
        if (existing?.filterable) {
          continue;
        }

        const classified = classifyProperty({
          baseUrl,
          dataTypes,
          propertySchema,
          propertyTypes,
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
