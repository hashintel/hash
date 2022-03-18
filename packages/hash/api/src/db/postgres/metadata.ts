import { NotFoundError, sql } from "slonik";
import { Connection } from "./types";
import { EntityMeta } from "../adapter";

import { DbEntityNotFoundError } from "../errors";

export const insertEntityMetadata = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    versioned: boolean;
    createdAt: Date;
    createdByAccountId: string;
    extra: any;
  },
): Promise<EntityMeta> => {
  await conn.query(sql`
    insert into entities (
      account_id, entity_id, versioned, extra, created_by_account_id, created_at, metadata_updated_at
    )
    values (
      ${params.accountId}, ${params.entityId}, ${params.versioned},
      ${sql.json(params.extra)}, ${params.createdByAccountId},
      ${params.createdAt.toISOString()},
      ${params.createdAt.toISOString()}
    )
  `);
  return params;
};

/**
 * Update the fixed metadata across all versions of an entity. Throws a
 * `DbEntityNotFoundError` if the entity does not exist.
 * */
export const updateEntityMetadata = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    extra: any;
  },
): Promise<EntityMeta> => {
  try {
    const row = await conn.one(sql`
      update entities
      set
        extra = ${sql.json(params.extra)},
        metadata_updated_at = ${new Date().toISOString()}
      where
        account_id = ${params.accountId} and entity_id = ${params.entityId}
      returning *
    `);
    return {
      versioned: row.versioned as boolean,
      extra: row.extra,
    };
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new DbEntityNotFoundError(params);
    }
    throw err;
  }
};
