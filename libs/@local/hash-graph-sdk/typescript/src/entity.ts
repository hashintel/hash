import type { Entity as GraphApiEntity } from "@local/hash-graph-client/api";
import type {
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  LinkData,
} from "@local/hash-graph-types/entity";

const typeId: unique symbol = Symbol.for(
  "@local/hash-graph-sdk/entity/SerializedEntity",
);
type TypeId = typeof typeId;

export interface SerializedEntity<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> {
  [typeId]: TypeId;
}

type EntityData<Properties extends EntityPropertiesObject> = {
  metadata: EntityMetadata;
  properties: Properties;
  linkData?: LinkData;
};

type EntityInput<Properties extends EntityPropertiesObject> =
  | GraphApiEntity
  | SerializedEntity<Properties>;

const isSerializedEntity = <Properties extends EntityPropertiesObject>(
  entity: EntityInput<Properties>,
): entity is SerializedEntity => {
  return typeId in entity;
};

const isGraphApiEntity = <Properties extends EntityPropertiesObject>(
  entity: EntityInput<Properties>,
): entity is GraphApiEntity => {
  return (entity as GraphApiEntity).metadata.entityTypeIds !== undefined;
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
          recordId: entity.metadata.recordId,
          entityTypeId: entity.metadata.entityTypeIds[0],
          temporalVersioning: entity.metadata.temporalVersioning,
          provenance: entity.metadata.provenance,
          archived: entity.metadata.archived,
          confidence: entity.metadata.confidence,
          properties: entity.metadata.properties,
        } as EntityMetadata,
        linkData: entity.linkData as LinkData,
      };
    } else {
      throw new Error(
        `Expected entity to be either a serialized entity, or a graph api entity, but got ${JSON.stringify(entity, null, 2)}`,
      );
    }
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

  public get linkData(): LinkData | undefined {
    return this.#entity.linkData;
  }

  public serialize(): SerializedEntity<Properties> {
    return { [typeId]: typeId, ...this.#entity };
  }
}

export class LinkEntity<
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> extends Entity<Properties> {
  constructor(entity: GraphApiEntity) {
    if (!entity.linkData) {
      throw new Error(
        `Expected link entity to have link data, but got \`${entity.linkData}\``,
      );
    }

    super(entity);
  }

  public get linkData(): LinkData {
    return super.linkData!;
  }
}
