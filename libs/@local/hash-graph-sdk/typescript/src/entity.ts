import type { VersionedUrl } from "@blockprotocol/graph";
import type { Entity as GraphApiEntity } from "@local/hash-graph-client/api";
import type {
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  LinkData,
  SimpleEntity,
  SimpleLinkEntity,
} from "@local/hash-graph-types/entity";

export type SerializedEntity = {
  metadata: EntityMetadata;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
};

export class Entity<
  Properties extends EntityPropertiesObject = EntityPropertiesObject,
> implements SimpleEntity<Properties>
{
  #entity: {
    properties: Properties;
    metadata: EntityMetadata;
    linkData?: LinkData;
  };

  constructor(entity: GraphApiEntity | SerializedEntity) {
    let entityTypeId: VersionedUrl;

    if ("entityTypeId" in entity.metadata) {
      entityTypeId = entity.metadata.entityTypeId;
    } else {
      if (entity.metadata.entityTypeIds.length !== 1) {
        throw new Error(
          `Expected entity metadata to have exactly one entity type id, but got ${entity.metadata.entityTypeIds.length}`,
        );
      }
      entityTypeId = entity.metadata.entityTypeIds[0] as VersionedUrl;
    }

    this.#entity = {
      properties: entity.properties as Properties,
      metadata: {
        recordId: entity.metadata.recordId,
        entityTypeId,
        temporalVersioning: entity.metadata.temporalVersioning,
        provenance: entity.metadata.provenance,
        archived: entity.metadata.archived,
        confidence: entity.metadata.confidence,
        properties: entity.metadata.properties,
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

  public serialize(): SerializedEntity {
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
