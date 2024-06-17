import type { VersionedUrl } from "@blockprotocol/graph";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  CreateEntityRequest as GraphApiCreateEntityRequest,
  Entity as GraphApiEntity,
  GraphApi,
  PatchEntityParams as GraphApiPatchEntityParams,
  PropertyProvenance,
} from "@local/hash-graph-client/api";
import type {
  CreatedById,
  EditionArchivedById,
  EditionCreatedById,
} from "@local/hash-graph-types/account";
import type {
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  EntityRecordId,
  EntityTemporalVersioningMetadata,
  EntityUuid,
  LinkData,
  PropertyMetadataElement,
  PropertyMetadataObject,
  PropertyPath,
} from "@local/hash-graph-types/entity";
import type {
  CreatedAtDecisionTime,
  CreatedAtTransactionTime,
} from "@local/hash-graph-types/temporal-versioning";
import type { OwnedById } from "@local/hash-graph-types/web";
import { isArray } from "lodash";
import zip from "lodash/zip";

import type { AuthenticationContext } from "./authentication-context";

export type CreateEntityParameters = Omit<
  GraphApiCreateEntityRequest,
  "entityTypeIds" | "decisionTime" | "draft" | "propertyMetadata"
> & {
  ownedById: OwnedById;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
  entityTypeId: VersionedUrl;
  entityUuid?: EntityUuid;
  propertyMetadata?: PropertyMetadataObject;
  draft?: boolean;
};

export type PatchEntityParameters = Omit<
  GraphApiPatchEntityParams,
  "entityId" | "entityTypeIds" | "decisionTime"
> & {
  entityTypeId?: VersionedUrl;
};
const typeId: unique symbol = Symbol.for(
  "@local/hash-graph-sdk/entity/SerializedEntity",
);
type TypeId = typeof typeId;

export interface SerializedEntity<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> {
  // Prevents the type from being created from outside the module
  [typeId]: TypeId;
}

type EntityData<
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> = {
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

type EntityInput<Properties extends EntityPropertiesObject> =
  | GraphApiEntity
  | SerializedEntity<Properties>;

const isSerializedEntity = <Properties extends EntityPropertiesObject>(
  entity: EntityInput<Properties>,
): entity is SerializedEntity => {
  return (
    "entityTypeId" in
    (entity as GraphApiEntity | EntityData<Properties>).metadata
  );
};

const isGraphApiEntity = <Properties extends EntityPropertiesObject>(
  entity: EntityInput<Properties>,
): entity is GraphApiEntity => {
  return (
    "entityTypeIds" in
    (entity as GraphApiEntity | EntityData<Properties>).metadata
  );
};

export const flattenedPropertyMetadataMap = (
  metadata: PropertyMetadataObject,
): {
  path: PropertyPath;
  metadata: Required<PropertyMetadataElement>["metadata"];
}[] => {
  const flattened: {
    path: PropertyPath;
    metadata: Required<PropertyMetadataElement>["metadata"];
  }[] = [];

  const visitElement = (
    path: PropertyPath,
    element: PropertyMetadataElement,
  ): void => {
    if (!("value" in element) || !element.value) {
      return;
    }
    if (isArray(element.value)) {
      for (const [index, value] of element.value.entries()) {
        visitElement([...path, index], value);
      }
    } else {
      for (const [key, value] of typedEntries(element.value)) {
        visitElement([...path, key], value);
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

export class Entity<
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> {
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
        params.map(({ entityTypeId, draft, ...rest }) => ({
          entityTypeIds: [entityTypeId],
          draft: draft ?? false,
          ...rest,
        })),
      )
      .then(({ data }) =>
        zip(params, data).map(
          ([request, metadata]) =>
            new Entity({
              metadata: metadata!,
              properties: request!.properties,
              linkData: request!.linkData,
            }),
        ),
      );
  }

  public async patch(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    { entityTypeId, ...params }: PatchEntityParameters,
  ): Promise<Entity<Properties>> {
    return graphAPI
      .patchEntity(authentication.actorId, {
        entityId: this.entityId,
        entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
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

  public propertyMetadata(
    path: PropertyPath,
  ): PropertyMetadataElement["metadata"] {
    return path.reduce<PropertyMetadataElement | undefined>((map, key) => {
      if (!map || !("value" in map) || !map.value) {
        return undefined;
      }
      if (typeof key === "number") {
        if (isArray(map.value)) {
          return map.value[key];
        } else {
          return undefined;
        }
      } else if (!isArray(map.value)) {
        return map.value[key];
      } else {
        return undefined;
      }
    }, this.#entity.metadata.properties)?.metadata;
  }

  public flattenedProperties(): {
    path: PropertyPath;
    metadata: PropertyMetadataElement["metadata"];
  }[] {
    return flattenedPropertyMetadataMap(
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
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
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
        params.map(({ entityTypeId, draft, ...rest }) => ({
          entityTypeIds: [entityTypeId],
          draft: draft ?? false,
          ...rest,
        })),
      )
      .then(({ data }) =>
        zip(params, data).map(
          ([request, metadata]) =>
            new LinkEntity({
              metadata: metadata!,
              properties: request!.properties,
              linkData: request!.linkData,
            }),
        ),
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
    { entityTypeId, ...params }: PatchEntityParameters,
  ): Promise<LinkEntity<Properties>> {
    return graphAPI
      .patchEntity(authentication.actorId, {
        entityId: this.entityId,
        entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
        ...params,
      })
      .then(({ data }) => new LinkEntity<Properties>(data));
  }

  public get linkData(): LinkData {
    return super.linkData!;
  }
}
