import type { Entity as GraphApiEntity } from "@local/hash-graph-client/api";
import type {
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  LinkData,
  SimpleEntity,
  SimpleLinkEntity,
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

export class Entity<
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> implements SimpleEntity<Properties>
{
  #entity: EntityData<Properties>;

  constructor(entity: GraphApiEntity | SerializedEntity<Properties>) {
    if (typeId in entity) {
      this.#entity = entity as unknown as EntityData<Properties>;
    } else {
      if (entity.metadata.entityTypeIds.length !== 1) {
        throw new Error(
          `Expected entity metadata to have exactly one entity type id, but got ${entity.metadata.entityTypeIds.length}`,
        );
      }

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
  >
  extends Entity<Properties>
  implements SimpleLinkEntity<Properties>
{
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
