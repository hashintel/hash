import type { Entity as GraphApiEntity } from "@local/hash-graph-client/api";
import type { EntityRecordId } from "@local/hash-subgraph";

export class Entity {
  #entity: GraphApiEntity;

  constructor(entity: GraphApiEntity) {
    this.#entity = entity;
  }

  public get entityId(): EntityRecordId {
    return this.#entity.metadata.recordId.entityId as EntityId;
  }
}
