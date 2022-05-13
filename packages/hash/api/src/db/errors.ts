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
  aggregationId: string;

  constructor(params: { aggregationId: string }) {
    const { aggregationId } = params;
    super(`Aggregation with aggregationId ${aggregationId} not found`);
    this.aggregationId = aggregationId;
  }
}
