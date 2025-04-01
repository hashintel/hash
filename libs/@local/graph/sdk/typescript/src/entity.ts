import type {
  ActorEntityUuid,
  BaseUrl,
  ClosedEntityType,
  ClosedMultiEntityType,
  EntityId,
  EntityMetadata,
  EntityUuid,
  LinkData,
  OwnedById,
  Property,
  PropertyArrayWithMetadata,
  PropertyMetadata,
  PropertyObject,
  PropertyObjectMetadata,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
  PropertyPath,
  PropertyType,
  PropertyValueMetadata,
  PropertyValueWithMetadata,
  PropertyWithMetadata,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  isArrayMetadata,
  isBaseUrl,
  isObjectMetadata,
  isValueMetadata,
} from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type {
  CreateEntityRequest as GraphApiCreateEntityRequest,
  Entity as GraphApiEntity,
  GraphApi,
  PatchEntityParams as GraphApiPatchEntityParams,
  ValidateEntityParams,
} from "@local/hash-graph-client";
import type { EntityProperties } from "@local/hash-graph-types/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-types/ontology";
import type { EntityValidationReport } from "@local/hash-graph-types/validation";

import type { AuthenticationContext } from "./authentication-context.js";

/**
 * Types used in getEntitySubgraph response to indicate the count of these in the whole result set,
 * useful for filtering only a limited number of entities are returned in a single response.
 */
export type CreatedByIdsMap = Record<ActorEntityUuid, number>;
export type TypeIdsMap = Record<VersionedUrl, number>;
export type TypeTitlesMap = Record<VersionedUrl, string>;
export type WebIdsMap = Record<OwnedById, number>;

export type CreateEntityParameters<
  T extends EntityProperties = EntityProperties,
> = Omit<
  GraphApiCreateEntityRequest,
  "decisionTime" | "entityTypeIds" | "draft" | "properties" | "provenance"
> & {
  ownedById: OwnedById;
  properties: T["propertiesWithMetadata"];
  linkData?: LinkData;
  entityTypeIds: T["entityTypeIds"];
  entityUuid?: EntityUuid;
  provenance: ProvidedEntityEditionProvenance;
  draft?: boolean;
};

export type PatchEntityParameters = Omit<
  GraphApiPatchEntityParams,
  "entityId" | "decisionTime" | "properties" | "provenance"
> & {
  propertyPatches?: PropertyPatchOperation[];
  provenance: ProvidedEntityEditionProvenance;
};

const typeId: unique symbol = Symbol.for(
  "@local/hash-graph-sdk/entity/SerializedEntity",
);
type TypeId = typeof typeId;

export interface SerializedEntity<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Properties extends PropertyObject = PropertyObject,
> {
  // Prevents the type from being created from outside the module
  [typeId]: TypeId;
}

type EntityData<Properties extends EntityProperties = EntityProperties> = {
  metadata: EntityMetadata<Properties["entityTypeIds"]>;
  properties: Properties["properties"];
  linkData?: LinkData;
};

type EntityInput<Properties extends PropertyObject> =
  | GraphApiEntity
  | SerializedEntity<Properties>;

const isSerializedEntity = <Properties extends EntityProperties>(
  entity: EntityInput<EntityProperties["properties"]>,
): entity is SerializedEntity => {
  return (
    "entityTypeId" in
    (entity as GraphApiEntity | EntityData<Properties>).metadata
  );
};

const isGraphApiEntity = <Properties extends EntityProperties>(
  entity: EntityInput<EntityProperties["properties"]>,
): entity is GraphApiEntity => {
  return (
    "entityTypeIds" in
    (entity as GraphApiEntity | EntityData<Properties>).metadata
  );
};

export const propertyObjectToPatches = (
  object: PropertyObjectWithMetadata,
): PropertyPatchOperation[] =>
  typedEntries(object.value).map(([propertyTypeBaseUrl, property]) => {
    return {
      op: "add",
      path: [propertyTypeBaseUrl],
      property,
    };
  });

/**
 * Creates an array of PropertyPatchOperations that, if applied, will transform the oldProperties into the
 * newProperties.
 *
 * @deprecated this is a function for migration purposes only.
 *    For new code, track which properties are actually changed where they are changed, and create the patch operations
 *   directly. IF you use this, bear in mind that newProperties MUST represent ALL the properties that the entity will
 *   have after the patch. Any properties not specified in newProperties will be removed.
 */
export const patchesFromPropertyObjects = ({
  oldProperties,
  newProperties,
}: {
  oldProperties: PropertyObject;
  newProperties: PropertyObjectWithMetadata;
}): PropertyPatchOperation[] => {
  const patches: PropertyPatchOperation[] = [];

  for (const [key, property] of typedEntries(newProperties.value)) {
    if (
      typeof oldProperties[key] !== "undefined" &&
      oldProperties[key] !== property.value
    ) {
      patches.push({
        op: "replace",
        path: [key],
        property,
      });
    } else {
      patches.push({
        op: "add",
        path: [key],
        property,
      });
    }
  }

  for (const key of typedKeys(oldProperties)) {
    if (typeof newProperties.value[key] === "undefined") {
      patches.push({
        op: "remove",
        path: [key],
      });
    }
  }

  return patches;
};

/**
 * Return a helper function for the given Properties object and patches, which can be called with a BaseUrl valid for
 * that object, and will return the new value for that BaseUrl defined in the provided list of patches, or undefined if
 * no new value has been set.
 *
 * The 'new value' is defined as the value for the first 'add' or 'replace' operation at that BaseUrl.
 * NOT supported:
 *  - the net effect of multiple operations on the same path
 *  - nested paths / array paths
 *
 * If you want to see if a value has been _removed_, see {@link isValueRemovedByPatches}
 *
 * An alternative implementation could avoid the need for an inner function, by requiring that the Key was specified as
 * a generic: export const getDefinedPropertyFromPatches = < Properties extends PropertyObject, Key extends keyof
 * Properties,
 * > => { ... }
 *
 * const newValue = getDefinedPropertyFromPatches<Properties, "https://example.com/">({ propertyPatches, baseUrl:
 * "https://example.com/" });
 *
 * This alternative is more tedious if you need to check for multiple properties, as (1) each key must be specified as
 * both a generic and as an argument, and (2) the propertyPatches provided each time. Unimplemented TS proposal partial
 * type argument inference would solve (1) but not (2).
 */
export const getDefinedPropertyFromPatchesGetter = <
  Properties extends PropertyObject,
>(
  propertyPatches: PropertyPatchOperation[],
) => {
  return <Key extends keyof Properties>(
    baseUrl: Key,
  ): Properties[Key] | undefined => {
    const foundPatch = propertyPatches.find(
      (patch) => patch.path[0] === baseUrl,
    );

    if (!foundPatch || foundPatch.op === "remove") {
      return;
    }

    return foundPatch.property.value as Properties[Key];
  };
};

export const isValueRemovedByPatches = <Properties extends PropertyObject>({
  baseUrl,
  propertyPatches,
}: {
  baseUrl: keyof Properties;
  propertyPatches: PropertyPatchOperation[];
}): boolean => {
  return propertyPatches.some(
    (patch) => patch.op === "remove" && patch.path[0] === baseUrl,
  );
};

/**
 * @hidden
 * @deprecated - For migration purposes only.
 *
 * Callers should instead specify property updates by specifying its metadata directly.
 */
export const mergePropertiesAndMetadata = (
  property: Property,
  metadata?: PropertyMetadata,
): PropertyWithMetadata => {
  if (Array.isArray(property)) {
    if (!metadata) {
      return {
        value: property.map((element) =>
          mergePropertiesAndMetadata(element, undefined),
        ),
        metadata: undefined,
      } satisfies PropertyArrayWithMetadata;
    }
    if (isArrayMetadata(metadata)) {
      return {
        value: property.map((element, index) =>
          mergePropertiesAndMetadata(element, metadata.value[index]),
        ),
        metadata: metadata.metadata,
      } satisfies PropertyArrayWithMetadata;
    }
    if (isObjectMetadata(metadata)) {
      throw new Error(
        `Expected metadata to be an array, but got metadata for property object: ${JSON.stringify(
          metadata,
          null,
          2,
        )}`,
      );
    }
    // Metadata is for a value, so we treat the property as a value
    return {
      value: property,
      metadata: metadata.metadata,
    } satisfies PropertyValueWithMetadata;
  }

  if (typeof property === "object" && property !== null) {
    if (!metadata) {
      const returnedValues: Record<BaseUrl, PropertyWithMetadata> = {};
      let isPropertyObject = true;
      for (const [key, value] of typedEntries(property)) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- It's possible for values to be undefined
        if (value === undefined) {
          continue;
        }
        if (!isBaseUrl(key)) {
          isPropertyObject = false;
          break;
        }
        returnedValues[key] = mergePropertiesAndMetadata(value, undefined);
      }
      if (isPropertyObject) {
        // we assume that the property is a property object if all keys are base urls.
        // This is not strictly the case as the property could be a value object with base urls as
        // keys, but we don't have a way to distinguish between the two.
        return {
          value: returnedValues,
        } satisfies PropertyObjectWithMetadata;
      }
      // If the keys are not base urls, we treat the object as a value
      return {
        value: property,
        metadata: {
          dataTypeId: null,
        },
      } satisfies PropertyValueWithMetadata;
    }
    if (isObjectMetadata(metadata)) {
      return {
        value: Object.fromEntries(
          Object.entries(property)
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- It's possible for values to be undefined
            .filter(([_key, value]) => value !== undefined)
            .map(([key, value]) => {
              if (!isBaseUrl(key)) {
                throw new Error(
                  `Expected property key to be a base URL, but got ${JSON.stringify(
                    key,
                    null,
                    2,
                  )}`,
                );
              }
              return [
                key,
                mergePropertiesAndMetadata(value, metadata.value[key]),
              ];
            }),
        ),
        metadata: metadata.metadata,
      } satisfies PropertyObjectWithMetadata;
    }
    if (isArrayMetadata(metadata)) {
      throw new Error(
        `Expected metadata to be an object, but got metadata for property array: ${JSON.stringify(
          metadata,
          null,
          2,
        )}`,
      );
    }
    // Metadata is for a value, so we treat the property as a value
    return {
      value: property,
      metadata: metadata.metadata,
    } satisfies PropertyValueWithMetadata;
  }

  // The property is not an array or object, so we treat it as a value
  if (!metadata) {
    return {
      value: property,
      metadata: {
        dataTypeId: null,
      },
    } satisfies PropertyValueWithMetadata;
  }

  if (isValueMetadata(metadata)) {
    return {
      value: property,
      metadata: metadata.metadata,
    } satisfies PropertyValueWithMetadata;
  }

  if (isArrayMetadata(metadata)) {
    throw new Error(
      `Expected metadata to be for a value, but got metadata for property array: ${JSON.stringify(
        metadata,
        null,
        2,
      )}`,
    );
  } else {
    throw new Error(
      `Expected metadata to be for a value, but got metadata for property object: ${JSON.stringify(
        metadata,
        null,
        2,
      )}`,
    );
  }
};

/**
 * Merge a property object with property metadata
 * – this creates the format the Graph API requires for create and validate calls.
 */
export const mergePropertyObjectAndMetadata = <T extends EntityProperties>(
  property: T["properties"],
  metadata?: PropertyObjectMetadata,
): T["propertiesWithMetadata"] => {
  return {
    value: Object.fromEntries(
      Object.entries(property)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- It's possible for values to be undefined
        .filter(([_key, value]) => value !== undefined)
        .map(([key, value]) => {
          if (!isBaseUrl(key)) {
            throw new Error(
              `Expected property key to be a base URL, but got ${JSON.stringify(
                key,
                null,
                2,
              )}`,
            );
          }
          return [key, mergePropertiesAndMetadata(value, metadata?.value[key])];
        }),
    ),
    metadata: metadata?.metadata,
  } satisfies PropertyObjectWithMetadata;
};

export const flattenPropertyMetadata = (
  metadata: PropertyObjectMetadata,
): {
  path: PropertyPath;
  metadata: Required<PropertyMetadata>["metadata"];
}[] => {
  const flattened: {
    path: PropertyPath;
    metadata: Required<PropertyMetadata>["metadata"];
  }[] = [];

  const visitElement = (
    path: PropertyPath,
    element: PropertyMetadata,
  ): void => {
    if ("value" in element) {
      if (Array.isArray(element.value)) {
        for (const [index, value] of element.value.entries()) {
          visitElement([...path, index], value);
        }
      } else {
        for (const [key, value] of typedEntries(element.value)) {
          visitElement([...path, key], value);
        }
      }
    }

    if (element.metadata) {
      flattened.push({
        path,
        metadata: element.metadata,
      });
    }
  };

  visitElement([], metadata);

  return flattened;
};

export const getDisplayFieldsForClosedEntityType = (
  closedType:
    | Pick<ClosedMultiEntityType, "allOf">
    | Pick<ClosedEntityType, "allOf" | "$id">,
) => {
  let foundLabelProperty = undefined;
  let foundIcon = undefined;
  let isLink = false;

  const breadthFirstArray =
    "$id" in closedType
      ? /**
         * This is a closed, single entity type. Its inheritance chain, including itself, is breadth-first in 'allOf'.
         */
        closedType.allOf
      : /**
         * This is a multi-entity-type, where each item in the root 'allOf' is a closed type,
         * each of which has its inheritance chain (including itself) in a breadth-first order in its own 'allOf'.
         * We need to sort all this by depth rather than going through the root 'allOf' directly,
         * which would process the entire inheritance chain of each type in the multi-type before moving to the next
         * one.
         */
        closedType.allOf
          .flatMap((type) => type.allOf)
          .sort((a, b) => a.depth - b.depth);

  for (const { icon, labelProperty, $id } of breadthFirstArray) {
    if (!foundIcon && icon) {
      foundIcon = icon;
    }
    if (!foundLabelProperty && labelProperty) {
      foundLabelProperty = labelProperty;
    }

    if (!isLink) {
      isLink =
        $id ===
        /**
         * Ideally this wouldn't be hardcoded but the only places to import it from would create a circular dependency
         * between packages
         * @todo do something about this
         */
        ("https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1" as VersionedUrl);
    }

    if (foundIcon && foundLabelProperty && isLink) {
      break;
    }
  }

  return {
    icon: foundIcon,
    isLink,
    labelProperty: foundLabelProperty,
  };
};

export const isClosedMultiEntityTypeForEntityTypeIds = (
  closedMultiEntityType: ClosedMultiEntityType,
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]],
) => {
  const entityTypeIdsSet = new Set(
    entityTypeIds.map((entityTypeId) => entityTypeId),
  );
  const closedMultiEntityTypeIdsSet = new Set(
    closedMultiEntityType.allOf.map((entityType) => entityType.$id),
  );

  if (entityTypeIdsSet.size !== closedMultiEntityTypeIdsSet.size) {
    return false;
  }

  for (const value of entityTypeIdsSet) {
    /**
     * We can't use Set.isSubsetOf/isSupersetOf until using Node 22+ everywhere that might use this
     */
    if (!closedMultiEntityTypeIdsSet.has(value)) {
      return false;
    }
  }

  return true;
};

export const getPropertyTypeForClosedMultiEntityType = (
  closedMultiEntityType: ClosedMultiEntityType,
  propertyTypeBaseUrl: BaseUrl,
  definitions: ClosedMultiEntityTypesDefinitions,
): PropertyType => {
  const schema = closedMultiEntityType.properties[propertyTypeBaseUrl];

  if (!schema) {
    throw new Error(
      `Expected ${propertyTypeBaseUrl} to appear in closed entity type properties`,
    );
  }

  const propertyTypeId = "items" in schema ? schema.items.$ref : schema.$ref;

  const propertyType = definitions.propertyTypes[propertyTypeId];

  if (!propertyType) {
    throw new Error(
      `Expected ${propertyTypeId} to appear in definitions.propertyTypes`,
    );
  }

  return propertyType;
};

/**
 * Retrieves a `ClosedMultiEntityType` from a given response based on a list of entity type IDs.
 *
 * @param closedMultiEntityTypes - The object returned from the Graph API which contains the closed multi-entity types.
 * @param entityTypesIds - An array of entity type IDs.
 * @throws Error If the closed entity type for the given entityTypeIds is not found in the map.
 * @returns ClosedMultiEntityType
 */
export const getClosedMultiEntityTypeFromMap = (
  closedMultiEntityTypes: ClosedMultiEntityTypesRootMap | undefined,
  entityTypesIds: [VersionedUrl, ...VersionedUrl[]],
): ClosedMultiEntityType => {
  if (!closedMultiEntityTypes) {
    throw new Error(`Expected closedMultiEntityTypes to be defined`);
  }

  // The `closedMultiEntityTypes` field contains a nested map of closed entity types.
  // At each depth the map contains a `schema` field which contains the closed multi-entity type
  // up to that depth. The `inner` field contains the next level of nested maps.
  // The nested keys are always sorted after the keys of the current depth.
  //
  // For example: If an entity type ID is `["https://example.com/1", "https://example.com/2"]`
  // the nested map would look like this:
  // {
  //    "https://example.com/1": {
  //      "schema": <Closed schema of "https://example.com/1">
  //      "inner": {
  //        "https://example.com/2": {
  //          "schema": <Closed schema of "https://example.com/1" and "https://example.com/2">
  //          "inner": {
  //            ...
  //         }
  //       }
  //    }
  // }
  //
  // Thus, we sort the entity type IDs and traverse the nested map to find the closed multi-entity type.
  // The first entity type ID is used to get the first level of the nested map. The rest of the entity
  // type IDs are used to traverse the nested map.
  const [firstEntityTypeId, ...restEntityTypesIds] =
    entityTypesIds.toSorted() as typeof entityTypesIds;

  const unMappedFirstEntityType = closedMultiEntityTypes[firstEntityTypeId];

  if (!unMappedFirstEntityType) {
    throw new Error(
      `Could not find closed entity type for id ${firstEntityTypeId} in map`,
    );
  }

  const unmappedClosedEntityType = restEntityTypesIds.reduce(
    (map, entityTypeId) => {
      const nextEntityType = map.inner?.[entityTypeId];
      if (!nextEntityType) {
        throw new Error(
          `Could not find closed entity type for id ${entityTypeId} in map`,
        );
      }

      return nextEntityType;
    },
    unMappedFirstEntityType,
  );

  return unmappedClosedEntityType.schema as ClosedMultiEntityType;
};

export const getPropertyTypeForClosedEntityType = ({
  closedMultiEntityType,
  definitions,
  propertyTypeBaseUrl,
}: {
  closedMultiEntityType: ClosedMultiEntityType;
  definitions: ClosedMultiEntityTypesDefinitions;
  propertyTypeBaseUrl: BaseUrl;
}) => {
  const schema = closedMultiEntityType.properties[propertyTypeBaseUrl];

  if (!schema) {
    throw new Error(
      `Expected ${propertyTypeBaseUrl} to appear in entity properties`,
    );
  }

  const propertyTypeId = "items" in schema ? schema.items.$ref : schema.$ref;

  const propertyType = definitions.propertyTypes[propertyTypeId];

  if (!propertyType) {
    throw new Error(
      `Expected ${propertyTypeId} to appear in definitions.propertyTypes`,
    );
  }

  return {
    propertyType,
    schema,
  };
};

const setMetadataForPropertyPath = (
  path: PropertyPath,
  leafMetadata: PropertyValueMetadata | "delete",
  currentMetadataUpToPath: PropertyMetadata | undefined,
): PropertyMetadata | undefined => {
  const nextKey = path[0];

  if (typeof nextKey === "undefined") {
    if (leafMetadata === "delete") {
      return undefined;
    } else {
      return leafMetadata;
    }
  }

  if (typeof nextKey === "number") {
    const metadataUpToHere =
      currentMetadataUpToPath && isArrayMetadata(currentMetadataUpToPath)
        ? currentMetadataUpToPath
        : { value: [] };

    const innerMetadata = setMetadataForPropertyPath(
      path.slice(1),
      leafMetadata,
      metadataUpToHere.value[nextKey],
    );
    if (!innerMetadata) {
      metadataUpToHere.value.splice(nextKey, 1);
    } else {
      metadataUpToHere.value[nextKey] = innerMetadata;
    }

    return metadataUpToHere;
  }

  const metadataUpToHere =
    currentMetadataUpToPath && isObjectMetadata(currentMetadataUpToPath)
      ? currentMetadataUpToPath
      : { value: {} };

  const innerMetadata = setMetadataForPropertyPath(
    path.slice(1),
    leafMetadata,
    metadataUpToHere.value[nextKey],
  );

  if (!innerMetadata) {
    delete metadataUpToHere.value[nextKey];
  } else {
    metadataUpToHere.value[nextKey] = innerMetadata;
  }
  return metadataUpToHere;
};

/**
 * Generate a new property metadata object based on an existing one, with a value's metadata set or deleted.
 * This is a temporary solution to be replaced by the SDK accepting {@link PropertyPatchOperation}s directly,
 * which it then applies to the entity to generate the new properties and metadata.
 *
 * @returns {PropertyMetadataObject} a new object with the changed metadata
 * @throws {Error} if the path is not supported (complex arrays or property objects)
 */
export const generateChangedPropertyMetadataObject = (
  path: PropertyPath,
  metadata: PropertyValueMetadata | "delete",
  baseMetadataObject: PropertyObjectMetadata,
): PropertyObjectMetadata => {
  const clonedMetadata = JSON.parse(JSON.stringify(baseMetadataObject)) as
    | PropertyObjectMetadata
    | undefined;

  if (!clonedMetadata || !isObjectMetadata(clonedMetadata)) {
    throw new Error(
      `Expected metadata to be an object, but got metadata for property array: ${JSON.stringify(
        clonedMetadata,
        null,
        2,
      )}`,
    );
  }

  const firstKey = path[0];

  if (!firstKey) {
    throw new Error("Expected path to have at least one key");
  }

  if (typeof firstKey === "number") {
    throw new Error(`Expected first key to be a string, but got ${firstKey}`);
  }

  const newMetadata = setMetadataForPropertyPath(
    path.slice(1),
    metadata,
    clonedMetadata.value[firstKey],
  );
  if (!newMetadata) {
    delete clonedMetadata.value[firstKey];
  } else {
    clonedMetadata.value[firstKey] = newMetadata;
  }

  return clonedMetadata;
};

export class Entity<PropertyMap extends EntityProperties = EntityProperties> {
  #entity: EntityData<PropertyMap>;

  constructor(entity: EntityInput<PropertyMap["properties"]>) {
    if (isSerializedEntity(entity) || isGraphApiEntity(entity)) {
      this.#entity = entity as EntityData<PropertyMap>;
    } else {
      throw new Error(
        `Expected entity to be either a serialized entity, or a graph api entity, but got ${JSON.stringify(entity, null, 2)}`,
      );
    }
  }

  public static async create<T extends EntityProperties>(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: CreateEntityParameters<T>,
  ): Promise<Entity<T>> {
    return (
      await Entity.createMultiple<[T]>(graphAPI, authentication, [params])
    )[0];
  }

  public static async createMultiple<T extends EntityProperties[]>(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: { [I in keyof T]: CreateEntityParameters<T[I]> },
  ): Promise<{ [I in keyof T]: Entity<T[I]> }> {
    return graphAPI
      .createEntities(
        authentication.actorId,
        params.map(({ entityTypeIds, draft, ...rest }) => ({
          entityTypeIds,
          draft: draft ?? false,
          ...rest,
        })),
      )
      .then(
        ({ data: entities }) =>
          // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          entities.map((entity, index) => {
            return new Entity<T[typeof index]>(entity);
          }) as { [I in keyof T]: Entity<T[I]> },
      );
  }

  public static async validate(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: Omit<ValidateEntityParams, "properties"> & {
      properties: PropertyObjectWithMetadata;
    },
  ): Promise<EntityValidationReport | undefined> {
    return await graphAPI
      .validateEntity(authentication.actorId, params)
      .then(({ data }) => data["0"] as EntityValidationReport);
  }

  public async patch(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    { entityTypeIds, propertyPatches, ...params }: PatchEntityParameters,
    /**
     * @todo H-3091: returning a specific 'this' will not be correct if the entityTypeId has been changed as part of
     *   the update. I tried using generics to enforce that a new EntityProperties must be provided if the entityTypeId
     *   is changed, but it isn't causing a compiler error:
     *
     *    public async patch<NewPropertyMap extends EntityProperties = PropertyMap>(
     *      // PatchEntityParams sets a specific VersionedUrl based on NewPropertyMap, but this is not enforced by the
     *   compiler params: PatchEntityParameters<NewPropertyMap>,
     *    )
     */
  ): Promise<this> {
    return graphAPI
      .patchEntity(authentication.actorId, {
        entityId: this.entityId,
        entityTypeIds,
        properties: propertyPatches,
        ...params,
      })
      .then(({ data }) => new Entity(data) as this);
  }

  public async archive(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    provenance: ProvidedEntityEditionProvenance,
  ): Promise<void> {
    await graphAPI.patchEntity(authentication.actorId, {
      entityId: this.entityId,
      archived: true,
      provenance,
    });
  }

  public async unarchive(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    provenance: ProvidedEntityEditionProvenance,
  ): Promise<void> {
    await graphAPI.patchEntity(authentication.actorId, {
      entityId: this.entityId,
      archived: false,
      provenance,
    });
  }

  public get metadata(): EntityMetadata {
    return this.#entity.metadata;
  }

  public get entityId(): EntityId {
    return this.#entity.metadata.recordId.entityId;
  }

  public get properties(): PropertyMap["properties"] {
    return this.#entity.properties;
  }

  /**
   * Get the merged object containing both property values and their metadata alongside them.
   * For use when calling methods that require this format (create, validate)
   */
  public get propertiesWithMetadata(): PropertyMap["propertiesWithMetadata"] {
    return mergePropertyObjectAndMetadata<PropertyMap>(
      this.#entity.properties,
      this.#entity.metadata.properties,
    );
  }

  public get propertiesMetadata(): PropertyObjectMetadata {
    return this.#entity.metadata.properties ?? { value: {} };
  }

  public propertyMetadata(path: PropertyPath): PropertyMetadata | undefined {
    return path.reduce<PropertyMetadata | undefined>((map, key) => {
      if (!map || !("value" in map)) {
        return undefined;
      }
      if (typeof key === "number") {
        if (Array.isArray(map.value)) {
          return map.value[key];
        } else {
          return undefined;
        }
      } else if (!Array.isArray(map.value)) {
        return map.value[key];
      } else {
        return undefined;
      }
    }, this.#entity.metadata.properties);
  }

  public flattenedPropertiesMetadata(): {
    path: PropertyPath;
    metadata: PropertyMetadata["metadata"];
  }[] {
    return flattenPropertyMetadata(
      this.#entity.metadata.properties ?? { value: {} },
    );
  }

  public get linkData(): LinkData | undefined {
    return this.#entity.linkData;
  }

  public toJSON(): SerializedEntity<PropertyMap["properties"]> {
    return { [typeId]: typeId, ...this.#entity };
  }

  public get [Symbol.toStringTag](): string {
    return this.constructor.name;
  }
}

export class LinkEntity<
  Properties extends EntityProperties = EntityProperties,
> extends Entity<Properties> {
  constructor(entity: EntityInput<Properties> | Entity) {
    const input = (entity instanceof Entity ? entity.toJSON() : entity) as
      | GraphApiEntity
      | EntityData<Properties>;

    if (!input.linkData) {
      throw new Error(
        `Expected link entity to have link data, but got \`${input.linkData}\``,
      );
    }

    super(input as EntityInput<Properties>);
  }

  public static async createMultiple<T extends EntityProperties[]>(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: {
      [I in keyof T]: CreateEntityParameters<T[I]> & { linkData: LinkData };
    },
  ): Promise<{ [I in keyof T]: LinkEntity<T[I]> }> {
    return graphAPI
      .createEntities(
        authentication.actorId,
        params.map(({ entityTypeIds, draft, ...rest }) => ({
          entityTypeIds,
          draft: draft ?? false,
          ...rest,
        })),
      )
      .then(
        ({ data: entities }) =>
          entities.map((entity) => new LinkEntity(entity)) as {
            [I in keyof T]: LinkEntity<T[I]>;
          },
      );
  }

  public static async create<T extends EntityProperties>(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: CreateEntityParameters<T> & { linkData: LinkData },
  ): Promise<LinkEntity<T>> {
    return (
      await LinkEntity.createMultiple<[T]>(graphAPI, authentication, [params])
    )[0];
  }

  public async patch(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    { entityTypeIds, propertyPatches, ...params }: PatchEntityParameters,
  ): Promise<this> {
    return graphAPI
      .patchEntity(authentication.actorId, {
        entityId: this.entityId,
        entityTypeIds,
        properties: propertyPatches,
        ...params,
      })
      .then(({ data }) => new LinkEntity(data) as this);
  }

  public get linkData(): LinkData {
    return super.linkData!;
  }
}
