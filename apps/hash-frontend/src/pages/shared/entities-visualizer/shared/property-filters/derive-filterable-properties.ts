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
 * The string constants an enum-constrained data type permits, resolved along
 * the same chain as {@link resolveDataTypeValueKind} (own schema, lone
 * `anyOf` branch, `allOf` parents) — or `null` when no enum constrains the
 * type. Only string enums qualify: a number enum's select would commit
 * strings, and a string parameter never equals a stored JSONB number.
 */
const resolveStringEnumOptions = ({
  dataTypeId,
  dataTypes,
  seenDataTypeIds = new Set(),
}: {
  dataTypeId: VersionedUrl;
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  seenDataTypeIds?: Set<VersionedUrl>;
}): string[] | null => {
  if (seenDataTypeIds.has(dataTypeId)) {
    return null;
  }

  const dataType = dataTypes[dataTypeId];

  if (!dataType) {
    return null;
  }

  seenDataTypeIds.add(dataTypeId);

  const stringEnumOf = (constraints: unknown): string[] | null => {
    if (
      typeof constraints !== "object" ||
      constraints === null ||
      !("enum" in constraints)
    ) {
      return null;
    }
    const candidates = (constraints as { enum: unknown }).enum;
    return Array.isArray(candidates) &&
      candidates.length > 0 &&
      candidates.every(
        (candidate): candidate is string => typeof candidate === "string",
      )
      ? candidates
      : null;
  };

  if ("anyOf" in dataType.schema) {
    return dataType.schema.anyOf.length === 1
      ? stringEnumOf(dataType.schema.anyOf[0])
      : null;
  }

  const ownOptions = stringEnumOf(dataType.schema);

  if (ownOptions) {
    return ownOptions;
  }

  for (const parentTypeId of dataType.schema.allOf?.map(({ $ref }) => $ref) ??
    []) {
    const parentOptions = resolveStringEnumOptions({
      dataTypeId: parentTypeId,
      dataTypes,
      seenDataTypeIds,
    });

    if (parentOptions) {
      return parentOptions;
    }
  }

  return null;
};

/**
 * Classifies a single property (as it appears on one entity type) into a
 * {@link FilterMetadataForProperty}, or `null` if it should be omitted from the picker
 * (a supported-but-unfilterable kind like `null`, or a missing definition).
 *
 * Scalar text/number/boolean values get their full operator catalogs; a text
 * value constrained to a fixed set of constants classifies as `enum`, whose
 * operators pick values from a select instead of free text. Lists whose
 * elements are plain text (enum-constrained or not) classify as `textList`
 * (`contains` reaches inside elements, plus existence checks); every other
 * shape — nested objects, lists of non-text values, multi-data-type
 * properties — classifies as `opaque`, offering only the existence operators
 * (value comparisons on those shapes are misleading server-side).
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
  const isListAtEntityLevel = "items" in propertySchema;

  const propertyTypeId =
    "$ref" in propertySchema ? propertySchema.$ref : propertySchema.items.$ref;

  const propertyType = propertyTypes[propertyTypeId]?.schema;

  if (!propertyType) {
    return null;
  }

  const { title } = propertyType;

  const filterable = (
    kind: FilterValueKind,
    enumOptions?: string[],
  ): FilterMetadataForProperty => ({
    baseUrl,
    title,
    kind,
    ...(enumOptions ? { enumOptions } : {}),
    filterable: true,
  });

  /**
   * The property type's own value shape, before any entity-level list
   * wrapping: a scalar kind for a lone data-type reference (`enum` with its
   * options when the type constrains text to constants), `textList` for a
   * list of text values, `opaque` for any other shape, or `null` for a data
   * type resolving to no filterable primitive (e.g. an explicit null), which
   * stays out of the picker as before.
   */
  const resolveOwnShape = (): {
    kind: FilterValueKind;
    enumOptions?: string[];
  } | null => {
    // More than one permitted value definition: only existence is checkable.
    if (propertyType.oneOf.length > 1) {
      return { kind: "opaque" };
    }

    const valueDefinition = propertyType.oneOf[0];

    if ("$ref" in valueDefinition) {
      const kind = resolveDataTypeValueKind({
        dataTypeId: valueDefinition.$ref,
        dataTypes,
      });
      if (kind === "multiple-data-types") {
        return { kind: "opaque" };
      }
      if (kind === "string") {
        const enumOptions = resolveStringEnumOptions({
          dataTypeId: valueDefinition.$ref,
          dataTypes,
        });
        if (enumOptions) {
          return { kind: "enum", enumOptions };
        }
      }
      return kind ? { kind } : null;
    }

    if (valueDefinition.type === "object") {
      // A nested property object.
      return { kind: "opaque" };
    }

    // A list of values: `contains` reaches elements only when they are text.
    const [itemDefinition, ...rest] = valueDefinition.items.oneOf;
    if (rest.length === 0 && "$ref" in itemDefinition) {
      const itemKind = resolveDataTypeValueKind({
        dataTypeId: itemDefinition.$ref,
        dataTypes,
      });
      if (itemKind === "string") {
        return { kind: "textList" };
      }
    }
    return { kind: "opaque" };
  };

  const ownShape = resolveOwnShape();

  if (!ownShape) {
    return null;
  }

  if (isListAtEntityLevel) {
    // A list declared on the entity type: elements of plain text (enum or
    // free) keep `contains`; any other element shape can only be
    // existence-checked.
    return filterable(
      ownShape.kind === "string" || ownShape.kind === "enum"
        ? "textList"
        : "opaque",
    );
  }

  return filterable(ownShape.kind, ownShape.enumOptions);
};

/**
 * Derives the list of properties offered in the property-filter picker from all
 * entity types in the result set, not just the entity types present on the
 * currently returned page.
 *
 * Every property with a resolvable definition is filterable; its
 * {@link FilterValueKind} decides the operator catalog (see
 * {@link classifyProperty}): full catalogs for scalar text/number/boolean
 * values, `contains` + existence for lists of plain text, and existence only
 * for every other shape. Only properties resolving to no filterable primitive
 * (e.g. an explicit null) are omitted.
 *
 * Unfilterable classifications (with a
 * {@link FilterMetadataForProperty.disabledReason} the picker shows as a
 * disabled entry) are currently never produced, but the machinery remains for
 * shapes a future classifier pass may need to gate.
 *
 * When the same property base URL appears across several entity types in
 * different shapes (e.g. a list on one type, a single value on another), the
 * first filterable interpretation encountered wins.
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
