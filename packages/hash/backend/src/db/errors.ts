export class DbEntityNotFoundError extends Error {
  accountId: string;
  entityId: string;
  entityVersionId?: string;

  constructor(accountId: string, entityId: string, entityVersionId?: string) {
    super(
      `Entity ${entityId} ${
        entityVersionId ? `with version ID ${entityVersionId}` : ""
      } not found in account ${accountId}`
    );
    this.accountId = accountId;
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
  }
}
