import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type {
  CreateEntityRequest as GraphApiCreateEntityRequest,
  Entity as GraphApiEntity,
  GraphApi,
  OriginProvenance,
  PatchEntityParams as GraphApiPatchEntityParams,
  PropertyProvenance,
  ProvidedEntityEditionProvenance,
  ProvidedEntityEditionProvenanceOriginTypeEnum,
  ValidateEntityParams,
} from "@local/hash-graph-client";
import type {
  CreatedById,
  EditionArchivedById,
  EditionCreatedById,
} from "@local/hash-graph-types/account";
import type {
  EntityId,
  EntityMetadata,
  EntityProperties,
  EntityRecordId,
  EntityTemporalVersioningMetadata,
  EntityUuid,
  LinkData,
  Property,
  PropertyArrayWithMetadata,
  PropertyMetadata,
  PropertyMetadataObject,
  PropertyObject,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
  PropertyPath,
  PropertyValueWithMetadata,
  PropertyWithMetadata,
} from "@local/hash-graph-types/entity";
import {
  isArrayMetadata,
  isObjectMetadata,
  isValueMetadata,
} from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { isBaseUrl } from "@local/hash-graph-types/ontology";
import type {
  CreatedAtDecisionTime,
  CreatedAtTransactionTime,
} from "@local/hash-graph-types/temporal-versioning";
import type { OwnedById } from "@local/hash-graph-types/web";

import type { AuthenticationContext } from "./authentication-context.js";

export type EnforcedEntityEditionProvenance = Omit<
  ProvidedEntityEditionProvenance,
  "actorType" | "origin"
> & {
  actorType: ProvidedEntityEditionProvenance["actorType"];
  origin: OriginProvenance;
};

export type CreateEntityParameters<
  T extends EntityProperties = EntityProperties,
> = Omit<
  GraphApiCreateEntityRequest,
  "entityTypeIds" | "decisionTime" | "draft" | "properties" | "provenance"
> & {
  ownedById: OwnedById;
  properties: T["propertiesWithMetadata"];
  linkData?: LinkData;
  entityTypeId: T["entityTypeId"];
  entityUuid?: EntityUuid;
  provenance: EnforcedEntityEditionProvenance;
  draft?: boolean;
};

export type PatchEntityParameters = Omit<
  GraphApiPatchEntityParams,
  "entityId" | "entityTypeIds" | "decisionTime" | "properties" | "provenance"
> & {
  entityTypeId?: VersionedUrl;
  propertyPatches?: PropertyPatchOperation[];
  provenance: EnforcedEntityEditionProvenance;
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
  metadata: EntityMetadata<Properties["entityTypeId"]> & {
    confidence?: number;
    properties?: PropertyMetadataObject;
  };
  properties: Properties["properties"];
  linkData?: LinkData & {
    leftEntityConfidence?: number;
    rightEntityConfidence?: number;
    leftEntityProvenance?: PropertyProvenance;
    rightEntityProvenance?: PropertyProvenance;
  };
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
        metadata: {},
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
      metadata: {},
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
 * @hidden
 * @deprecated - For migration purposes only.
 */
export const mergePropertyObjectAndMetadata = <T extends EntityProperties>(
  property: T["properties"],
  metadata?: PropertyMetadataObject,
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
  metadata: PropertyMetadataObject,
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

export class Entity<PropertyMap extends EntityProperties = EntityProperties> {
  #entity: EntityData<PropertyMap>;

  constructor(entity: EntityInput<PropertyMap["properties"]>) {
    if (isSerializedEntity(entity)) {
      this.#entity = entity as unknown as EntityData<PropertyMap>;
    } else if (isGraphApiEntity(entity)) {
      this.#entity = {
        ...entity,
        properties: entity.properties as PropertyMap["properties"],
        metadata: {
          ...entity.metadata,
          recordId: entity.metadata.recordId as EntityRecordId,
          entityTypeId: entity.metadata.entityTypeIds[0] as VersionedUrl,
          temporalVersioning: entity.metadata
            .temporalVersioning as EntityTemporalVersioningMetadata,
          properties: entity.metadata.properties as PropertyMetadataObject,
          provenance: {
            ...entity.metadata.provenance,
            createdById: entity.metadata.provenance.createdById as CreatedById,
            createdAtDecisionTime: entity.metadata.provenance
              .createdAtDecisionTime as CreatedAtDecisionTime,
            createdAtTransactionTime: entity.metadata.provenance
              .createdAtTransactionTime as CreatedAtTransactionTime,
            firstNonDraftCreatedAtDecisionTime: entity.metadata.provenance
              .firstNonDraftCreatedAtDecisionTime as CreatedAtDecisionTime,
            firstNonDraftCreatedAtTransactionTime: entity.metadata.provenance
              .firstNonDraftCreatedAtTransactionTime as CreatedAtTransactionTime,
            edition: {
              ...entity.metadata.provenance.edition,
              createdById: entity.metadata.provenance.edition
                .createdById as EditionCreatedById,
              archivedById: entity.metadata.provenance.edition
                .archivedById as EditionArchivedById,
            },
          },
        },
        linkData: entity.linkData
          ? {
              ...entity.linkData,
              leftEntityId: entity.linkData.leftEntityId as EntityId,
              rightEntityId: entity.linkData.rightEntityId as EntityId,
            }
          : undefined,
      };
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
        params.map(({ entityTypeId, draft, provenance, ...rest }) => ({
          entityTypeIds: [entityTypeId],
          draft: draft ?? false,
          provenance: {
            ...provenance,
            origin: {
              ...provenance.origin,
              // ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
              type: provenance.origin
                .type as ProvidedEntityEditionProvenanceOriginTypeEnum,
            },
          },
          ...rest,
        })),
      )
      .then(
        ({ data: entities }) =>
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
  ): Promise<void> {
    return await graphAPI
      .validateEntity(authentication.actorId, params)
      .then(({ data }) => data);
  }

  public async patch(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    {
      entityTypeId,
      propertyPatches,
      provenance,
      ...params
    }: PatchEntityParameters,
    /**
     * @todo H-3091: returning a specific 'this' will not be correct if the entityTypeId has been changed as part of the update.
     *    I tried using generics to enforce that a new EntityProperties must be provided if the entityTypeId is changed, but
     *    it isn't causing a compiler error:
     *
     *    public async patch<NewPropertyMap extends EntityProperties = PropertyMap>(
     *      // PatchEntityParams sets a specific VersionedUrl based on NewPropertyMap, but this is not enforced by the compiler
     *      params: PatchEntityParameters<NewPropertyMap>,
     *    )
     */
  ): Promise<this> {
    return graphAPI
      .patchEntity(authentication.actorId, {
        entityId: this.entityId,
        entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
        properties: propertyPatches,
        provenance: {
          ...provenance,
          origin: {
            ...provenance.origin,
            // @ts-expect-error –– ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
            type: provenance.origin.type satisfies "migration",
          },
        },
        ...params,
      })
      .then(({ data }) => new Entity(data) as this);
  }

  public async archive(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
  ): Promise<void> {
    await graphAPI.patchEntity(authentication.actorId, {
      entityId: this.entityId,
      archived: true,
    });
  }

  public async unarchive(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
  ): Promise<void> {
    await graphAPI.patchEntity(authentication.actorId, {
      entityId: this.entityId,
      archived: false,
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
   * @hidden
   * @deprecated - For migration purposes only.
   */
  public get propertiesWithMetadata(): PropertyMap["propertiesWithMetadata"] {
    return mergePropertyObjectAndMetadata<PropertyMap>(
      this.#entity.properties,
      this.#entity.metadata.properties,
    );
  }

  public propertyMetadata(path: PropertyPath): PropertyMetadata["metadata"] {
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
    }, this.#entity.metadata.properties)?.metadata;
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
        params.map(({ entityTypeId, draft, provenance, ...rest }) => ({
          entityTypeIds: [entityTypeId],
          draft: draft ?? false,
          provenance: {
            ...provenance,
            origin: {
              ...provenance.origin,
              // ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
              type: provenance.origin
                .type as ProvidedEntityEditionProvenanceOriginTypeEnum,
            },
          },
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
    {
      entityTypeId,
      propertyPatches,
      provenance,
      ...params
    }: PatchEntityParameters,
  ): Promise<this> {
    return graphAPI
      .patchEntity(authentication.actorId, {
        entityId: this.entityId,
        entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
        properties: propertyPatches,
        provenance: {
          ...provenance,
          origin: {
            ...provenance.origin,
            // @ts-expect-error –– ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
            type: provenance.origin.type satisfies "migration",
          },
        },
        ...params,
      })
      .then(({ data }) => new LinkEntity(data) as this);
  }

  public get linkData(): LinkData {
    return super.linkData!;
  }
}
