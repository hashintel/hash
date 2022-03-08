import { DbEntity } from "./adapter";

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
    const ver = entityVersionId ? ` with versionID ${entityVersionId}` : "";
    super(`Entity ${entityId}${ver} not found in account ${accountId}`);
    this.accountId = accountId;
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
  }
}

export class DbEntityTypeNotFoundError extends Error {
  accountId?: string;
  entityTypeId?: string;
  entityTypeVersionId?: string;
  systemTypeName?: string;

  constructor(params: {
    accountId?: string;
    entityTypeId?: string;
    entityTypeVersionId?: string;
    systemTypeName?: string;
  }) {
    const { accountId, entityTypeId, entityTypeVersionId, systemTypeName } =
      params;
    if (params.systemTypeName) {
      super(
        `Critical: system entity type "${params.systemTypeName}" not found`,
      );
    } else {
      const ver = entityTypeVersionId
        ? ` with versionID ${entityTypeVersionId}`
        : "";
      const name = systemTypeName ? ` "${systemTypeName}"` : "";
      super(
        `Entity type${name} with ID ${entityTypeId}${ver} not found in account ${accountId}`,
      );
    }
    this.accountId = accountId;
    this.entityTypeId = entityTypeId;
    this.entityTypeVersionId = entityTypeVersionId;
    this.systemTypeName = params.systemTypeName;
  }
}

export class DbLinkNotFoundError extends Error {
  sourceAccountId?: string;
  linkId: string;

  constructor(params: { sourceAccountId?: string; linkId: string }) {
    const { sourceAccountId, linkId } = params;
    super(`Link ${linkId} not found in account ${sourceAccountId}`);
    this.sourceAccountId = sourceAccountId;
    this.linkId = linkId;
  }
}

export class DbAggregationNotFoundError extends Error {
  sourceAccountId?: string;
  sourceEntityId?: string;
  path: string;

  constructor(params: {
    sourceAccountId?: string;
    sourceEntityId?: string;
    path: string;
  }) {
    const { sourceAccountId, sourceEntityId, path } = params;
    super(
      `Aggregation with path ${path} for source entity with id ${sourceEntityId} in account ${sourceAccountId} not found`,
    );
    this.sourceAccountId = sourceAccountId;
    this.sourceEntityId = sourceEntityId;
    this.path = path;
  }
}

export class DbInvalidLinksError extends Error {
  entity: DbEntity;
  invalid: { entityId: string; entityVersionId?: string }[];

  constructor(params: {
    entity: DbEntity;
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
