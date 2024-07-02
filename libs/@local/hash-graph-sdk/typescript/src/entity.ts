import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  CreateEntityRequest as GraphApiCreateEntityRequest,
  Entity as GraphApiEntity,
  GraphApi,
  PatchEntityParams as GraphApiPatchEntityParams,
  PropertyProvenance,
  ProvidedEntityEditionProvenance,
} from "@local/hash-graph-client";
import type {
  CreatedById,
  EditionArchivedById,
  EditionCreatedById,
} from "@local/hash-graph-types/account";
import type {
  AddPropertyPatchOperation,
  EntityId,
  EntityMetadata,
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
  ReplacePropertyPatchOperation,
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

import type { AuthenticationContext } from "./authentication-context";

export type EnforcedEntityEditionProvenance =
  ProvidedEntityEditionProvenance & {
    actorType: ProvidedEntityEditionProvenance["actorType"];
    origin: ProvidedEntityEditionProvenance["origin"];
  };

export type CreateEntityParameters = Omit<
  GraphApiCreateEntityRequest,
  "entityTypeIds" | "decisionTime" | "draft" | "properties" | "provenance"
> & {
  ownedById: OwnedById;
  properties: PropertyObject;
  linkData?: LinkData;
  entityTypeId: VersionedUrl;
  entityUuid?: EntityUuid;
  propertyMetadata?: PropertyMetadataObject;
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

type EntityData<Properties extends PropertyObject = PropertyObject> = {
  metadata: EntityMetadata & {
    confidence?: number;
    properties?: PropertyMetadataObject;
  };
  properties: Properties;
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

const isSerializedEntity = <Properties extends PropertyObject>(
  entity: EntityInput<Properties>,
): entity is SerializedEntity => {
  return (
    "entityTypeId" in
    (entity as GraphApiEntity | EntityData<Properties>).metadata
  );
};

const isGraphApiEntity = <Properties extends PropertyObject>(
  entity: EntityInput<Properties>,
): entity is GraphApiEntity => {
  return (
    "entityTypeIds" in
    (entity as GraphApiEntity | EntityData<Properties>).metadata
  );
};

export const propertyObjectToPatches = (
  object: PropertyObject,
): PropertyPatchOperation[] =>
  typedEntries(object).map(([propertyTypeBaseUrl, value]) => {
    return {
      op: "add",
      path: [propertyTypeBaseUrl],
      value,
    };
  });

/**
 * Return a helper function for the given Properties object, which can be called with a BaseUrl valid for that object,
 * and will return the new value for that BaseUrl defined in the provided list of PropertyPatchOperations, if any.
 *
 * The 'new value' is defined as the value for the first 'add' or 'replace' operation at that BaseUrl.
 * Nested paths are not supported.
 *
 * An alternative implementation could avoid the need for an inner function, by requiring that the Key was specified as a generic:
 * export const getDefinedPropertyFromPatches = <
 *   Properties extends PropertyObject,
 *   Key extends keyof Properties,
 * > => { ... }
 *
 * const newValue = getDefinedPropertyFromPatches<Properties, "https://example.com/">({ propertyPatches, baseUrl: "https://example.com/" });
 *
 * This alternative is more tedious if you need to check for multiple properties, as (1) each key must be specified as both a generic and as an argument,
 * and (2) the propertyPatches provided each time. Unimplemented TS proposal partial type argument inference would solve (1) but not (2).
 */
export const getDefinedPropertyFromPatchesRetriever = <
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

    return foundPatch.value as Properties[Key];
  };
};

const mergePropertiesAndMetadata = (
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

const mergePropertyObjectAndMetadata = (
  property: PropertyObject,
  metadata?: PropertyMetadataObject,
): PropertyObjectWithMetadata => {
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

export class Entity<Properties extends PropertyObject = PropertyObject> {
  #entity: EntityData<Properties>;

  constructor(entity: EntityInput<Properties>) {
    if (isSerializedEntity(entity)) {
      this.#entity = entity as unknown as EntityData<Properties>;
    } else if (isGraphApiEntity(entity)) {
      this.#entity = {
        ...entity,
        properties: entity.properties as Properties,
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

  public static async create(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: CreateEntityParameters,
  ): Promise<Entity> {
    return (
      await Entity.createMultiple(graphAPI, authentication, [params])
    )[0]!;
  }

  public static async createMultiple(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: CreateEntityParameters[],
  ): Promise<Entity[]> {
    return graphAPI
      .createEntities(
        authentication.actorId,
        params.map(
          ({ entityTypeId, draft, properties, propertyMetadata, ...rest }) => ({
            entityTypeIds: [entityTypeId],
            draft: draft ?? false,
            properties: mergePropertyObjectAndMetadata(
              properties,
              propertyMetadata,
            ),
            ...rest,
          }),
        ),
      )
      .then(({ data: entities }) =>
        entities.map((entity) => new Entity(entity)),
      );
  }

  public async patch(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    { entityTypeId, propertyPatches, ...params }: PatchEntityParameters,
  ): Promise<Entity<Properties>> {
    return graphAPI
      .patchEntity(authentication.actorId, {
        entityId: this.entityId,
        entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
        properties: propertyPatches?.map((operation) =>
          operation.op === "remove"
            ? operation
            : {
                op: operation.op,
                path: operation.path,
                property: mergePropertiesAndMetadata(
                  operation.value,
                  operation.metadata,
                ),
              },
        ),
        ...params,
      })
      .then(({ data }) => new Entity<Properties>(data));
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

  public get properties(): Properties {
    return this.#entity.properties;
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

  public toJSON(): SerializedEntity<Properties> {
    return { [typeId]: typeId, ...this.#entity };
  }

  public get [Symbol.toStringTag](): string {
    return this.constructor.name;
  }
}

export class LinkEntity<
  Properties extends PropertyObject = PropertyObject,
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

  public static async createMultiple(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: (CreateEntityParameters & { linkData: LinkData })[],
  ): Promise<LinkEntity[]> {
    return graphAPI
      .createEntities(
        authentication.actorId,
        params.map(
          ({ entityTypeId, draft, properties, propertyMetadata, ...rest }) => ({
            entityTypeIds: [entityTypeId],
            draft: draft ?? false,
            properties: mergePropertyObjectAndMetadata(
              properties,
              propertyMetadata,
            ),
            ...rest,
          }),
        ),
      )
      .then(({ data: entities }) =>
        entities.map((entity) => new LinkEntity(entity)),
      );
  }

  public static async create(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: CreateEntityParameters & { linkData: LinkData },
  ): Promise<LinkEntity> {
    return (
      await LinkEntity.createMultiple(graphAPI, authentication, [params])
    )[0]!;
  }

  public async patch(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    { entityTypeId, propertyPatches, ...params }: PatchEntityParameters,
  ): Promise<LinkEntity<Properties>> {
    return graphAPI
      .patchEntity(authentication.actorId, {
        entityId: this.entityId,
        entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
        properties: propertyPatches?.map((operation) =>
          operation.op === "remove"
            ? operation
            : {
                op: operation.op,
                path: operation.path,
                property: mergePropertiesAndMetadata(
                  operation.value,
                  operation.metadata,
                ),
              },
        ),
        ...params,
      })
      .then(({ data }) => new LinkEntity<Properties>(data));
  }

  public get linkData(): LinkData {
    return super.linkData!;
  }
}
