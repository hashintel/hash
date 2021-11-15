import { Entity } from "./adapter";

export class DbEntityNotFoundError extends Error {
  accountId?: string;
  entityId: string;
  entityVersionId?: string;

  constructor(params: {
    accountId?: string;
    entityId: string;
    entityVersionId?: string;
  }) {
    const { accountId, entityId, entityVersionId } = params;
    super(
      `Entity ${entityId} ${
        entityVersionId ? `with version ID ${entityVersionId}` : ""
      } not found in account ${accountId}`,
    );
    this.accountId = accountId;
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
  }
}

export class DbInvalidLinksError extends Error {
  entity: Entity;
  invalid: { entityId: string; entityVersionId?: string }[];

  constructor(params: {
    entity: Entity;
    invalid: { entityId: string; entityVersionId?: string }[];
  }) {
    const { entity, invalid } = params;
    super(
      `entity ${entity.entityId} with version ID ${
        entity.entityVersionId
      } and type "${
        entity.entityTypeName
      }" links to unknown entities: ${JSON.stringify(invalid)}`,
    );
    this.entity = entity;
    this.invalid = invalid;
  }
}
