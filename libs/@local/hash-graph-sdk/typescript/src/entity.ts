import type { Entity as GraphApiEntity } from "@local/hash-graph-client/api";
import type {
  Entity,
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  LinkData,
  LinkEntity,
} from "@local/hash-graph-types/entity";

export class GraphEntity<
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> implements Entity<Properties>
{
  #entity: {
    properties: Properties;
    metadata: EntityMetadata;
    linkData?: LinkData;
  };

  constructor(entity: GraphApiEntity) {
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
      } as EntityMetadata,
      linkData: entity.linkData as LinkData,
    };
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

  public asObject(): Entity<Properties> {
    return {
      metadata: this.metadata,
      properties: this.properties,
      linkData: this.linkData,
    };
  }
}

export class GraphLinkEntity<
    Properties extends EntityPropertiesObject = EntityPropertiesObject,
  >
  extends GraphEntity<Properties>
  implements LinkEntity<Properties>
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
