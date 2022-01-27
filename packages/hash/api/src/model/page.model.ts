import { Entity, EntityConstructorArgs, Page } from ".";
import { DBClient } from "../db";
import { SystemType } from "../types/entityTypes";

export type PageConstructorArgs = {
  outgoingEntityIds?: string[];
} & EntityConstructorArgs;

class __Page extends Entity {
  parentEntityId?: string;
  constructor(args: PageConstructorArgs) {
    super(args);
    this.parentEntityId = args.outgoingEntityIds?.[0] ?? undefined;
  }

  static async getAccountPagesWithParents(
    client: DBClient,
    params: {
      accountId: string;
      systemTypeName: SystemType;
    },
  ): Promise<Page[]> {
    const dbEntities = await client.getEntitiesByTypeWithOutgoingEntityIds(
      params,
    );

    return dbEntities.map((dbEntity) => new Page(dbEntity));
  }

  static async getAccountPageWithParents(
    client: DBClient,
    params: {
      accountId: string;
      entityId: string;
    },
  ): Promise<Page | null> {
    const dbEntity = await client.getEntityWithOutgoingEntityIds(params);
    return dbEntity ? new Page(dbEntity) : null;
  }
}

export default __Page;
