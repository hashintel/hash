import type { VersionedUrl } from "@blockprotocol/graph";
import type {
  Entity as GraphApiEntity,
  EntityRelationAndSubject,
  GraphApi,
  PropertyMetadata,
  PropertyMetadataMap,
  PropertyPath,
  PropertyProvenance,
  ProvidedEntityEditionProvenance,
} from "@local/hash-graph-client/api";
import type {
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  EntityProvenance,
  EntityRecordId,
  EntityTemporalVersioningMetadata,
  EntityUuid,
  LinkData,
} from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { isEqual, zip } from "lodash";

import type { AuthenticationContext } from "./authentication-context";

export type CreateEntityParameters = {
  ownedById: OwnedById;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
  entityTypeId: VersionedUrl;
  entityUuid?: EntityUuid;
  draft?: boolean;
  confidence?: number;
  propertyMetadata?: PropertyMetadataMap;
  provenance?: ProvidedEntityEditionProvenance;
  relationships: EntityRelationAndSubject[];
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

type EntityData<Properties extends EntityPropertiesObject> = {
  metadata: EntityMetadata & {
    confidence?: number;
    properties?: PropertyMetadataMap;
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

export class Entity<
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> {
  #entity: EntityData<Properties>;

  constructor(entity: EntityInput<Properties>) {
    if (isSerializedEntity(entity)) {
      this.#entity = entity as unknown as EntityData<Properties>;
    } else if (isGraphApiEntity(entity)) {
      this.#entity = {
        properties: entity.properties as Properties,
        metadata: {
          recordId: entity.metadata.recordId as EntityRecordId,
          entityTypeId: entity.metadata.entityTypeIds[0] as VersionedUrl,
          temporalVersioning: entity.metadata
            .temporalVersioning as EntityTemporalVersioningMetadata,
          provenance: entity.metadata.provenance as EntityProvenance,
          archived: entity.metadata.archived,
          confidence: entity.metadata.confidence,
          properties: entity.metadata.properties,
        },
        linkData: entity.linkData as LinkData,
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
        params.map((request) => ({
          ownedById: request.ownedById,
          properties: request.properties,
          linkData: request.linkData,
          entityTypeIds: [request.entityTypeId],
          entityUuid: request.entityUuid,
          draft: request.draft ?? false,
          confidence: request.confidence,
          propertyMetadata: request.propertyMetadata,
          provenance: request.provenance,
          relationships: request.relationships,
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

  public get metadata(): EntityMetadata {
    return this.#entity.metadata;
  }

  public get entityId(): EntityId {
    return this.#entity.metadata.recordId.entityId;
  }

  public get properties(): Properties {
    return this.#entity.properties;
  }

  public propertyMetadata(path: PropertyPath): PropertyMetadata | undefined {
    return this.#entity.metadata.properties?.find((map) =>
      isEqual(map.path, path),
    )?.metadata;
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
    return (await Entity.createMultiple(
      graphAPI,
      authentication,
      params,
    )) as LinkEntity[];
  }

  public static async create(
    graphAPI: GraphApi,
    authentication: AuthenticationContext,
    params: CreateEntityParameters & { linkData: LinkData },
  ): Promise<LinkEntity> {
    return (await Entity.create(
      graphAPI,
      authentication,
      params,
    )) as LinkEntity;
  }

  public get linkData(): LinkData {
    return super.linkData!;
  }
}
