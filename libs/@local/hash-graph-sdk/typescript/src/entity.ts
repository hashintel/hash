import type { Entity as GraphApiEntity } from "@local/hash-graph-client/api";
import type { EntityId } from "@local/hash-subgraph";

export class Entity {
  #entity: GraphApiEntity;

  constructor(entity: GraphApiEntity) {
    this.#entity = entity;
  }

  public get entityId(): EntityId {
    return this.#entity.metadata.recordId.entityId as EntityId;
  }
}
