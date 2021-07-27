import { Entity, EntityVersion } from "../adapter";
import { Connection } from "./types";

import { sql, QueryResultRowType } from "slonik";

/** maps a postgres row to its corresponding Entity object */
export const mapPGRowToEntity = (row: QueryResultRowType): Entity => ({
  accountId: row["account_id"] as string,
  entityId: row["entity_id"] as string,
  createdById: row["created_by"] as string,
  type: row["type"] as string,
  properties: row["properties"],
  historyId: row["history_id"] as string,
  metadata: {
    metadataId: row["metadata_id"] as string,
    extra: row["extra"],
  },
  metadataId: row["metadata_id"] as string,
  createdAt: new Date(row["created_at"] as number),
  updatedAt: new Date(row["updated_at"] as number),
});

export const selectEntities = sql`
  select
    e.account_id, e.entity_id, t.name as type, e.properties, e.created_by,
    e.created_at, e.updated_at, e.history_id, e.metadata_id, meta.extra,
    coalesce(e.history_id, e.entity_id) as grp_col
  from
    entities as e
    join entity_types as t on e.type = t.id
    join entity_metadata as meta on
        e.account_id = meta.account_id and  -- required for sharding
        e.metadata_id = meta.metadata_id
`;

/** Query for retrieving a specific version of an entity. */
const selectEntityVersion = (params: {
  accountId: string;
  entityId: string;
}) => sql`
  ${selectEntities}
  where
    e.account_id = ${params.accountId} and e.entity_id = ${params.entityId}
`;

/** Query for retrieving all versions of an entity */
const selectEntityAllVersions = (params: {
  accountId: string;
  metadataId: string;
}) => sql`
  ${selectEntities}
  where
    e.account_id = ${params.accountId} and e.metadata_id = ${params.metadataId}
`;

const selectEntitiesByType = (params: {
  accountId: string;
  type: string;
}) => sql`
  ${selectEntities}
  where
    e.account_id = ${params.accountId} and t.name = ${params.type}
`;

/** Get an entity. The optional argument `lock` may be set to `true` to lock
 *  the entity for selects or updates until the transaction completes. Returns
 * `undefined` if the entity does not exist in the given account.*/
export const getEntity = async (
  conn: Connection,
  params: { accountId: string; entityId: string },
  lock: boolean = false
): Promise<Entity | undefined> => {
  const query = lock
    ? sql`${selectEntityVersion(params)} for update`
    : selectEntityVersion(params);

  const row = await conn.maybeOne(query);
  return row ? mapPGRowToEntity(row) : undefined;
};

/** Get the latest version of an entity. Returns `undefined` if the entity does not
 *  exist in the given account.
 */
export const getLatestEntityVersion = async (
  conn: Connection,
  params: {
    accountId: string;
    metadataId: string;
  }
): Promise<Entity | undefined> => {
  const row = await conn.maybeOne(
    sql`
    with all_matches as (
      ${selectEntityAllVersions(params)}
    )
    select distinct on (metadata_id) * from all_matches
    order by metadata_id, updated_at desc`
  );
  return row ? mapPGRowToEntity(row) : undefined;
};

/** Get the latest version of all entitiies of a given type. */
export const getEntitiesByTypeLatest = async (
  conn: Connection,
  params: { accountId: string; type: string }
): Promise<Entity[]> => {
  const query = sql`
    with all_matches as (
      ${selectEntitiesByType(params)}
    )
    select distinct on (grp_col) * from all_matches
    order by grp_col, updated_at desc
  `;
  console.log(query);
  const rows = await conn.any(query);
  return rows.map(mapPGRowToEntity);
};

/** Get all versions of all entities of a given type. */
export const getEntitiesByTypeAllVersions = async (
  conn: Connection,
  params: { accountId: string; type: string }
) => {
  const rows = await conn.any(selectEntitiesByType(params));
  return rows.map(mapPGRowToEntity);
};

/** Get all account type entities (User or Account). */
export const getAccountEntities = async (conn: Connection) => {
  const rows = await conn.any(sql`
    ${selectEntities}
    where e.account_id = e.entity_id
  `);
  return rows.map(mapPGRowToEntity);
};

export const insertEntity = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    typeId: number;
    properties: any;
    historyId?: string;
    metadataId: string;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<void> => {
  await conn.query(sql`
    insert into entities (
      account_id, entity_id, type, properties, history_id, metadata_id, created_by,
      created_at, updated_at
    )
    values (
      ${params.accountId}, ${params.entityId}, ${params.typeId},
      ${sql.json(params.properties)}, ${params.historyId || null},
      ${params.metadataId}, ${params.createdById},
      ${params.createdAt.toISOString()}, ${params.updatedAt.toISOString()})
  `);
};

export const updateEntityProperties = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    properties: any;
    updatedAt: Date;
  }
) => {
  await conn.one(sql`
    update entities
      set properties = ${sql.json(params.properties)},
      updated_at = ${params.updatedAt.toISOString()}
    where
      account_id = ${params.accountId} and entity_id = ${params.entityId}
    returning entity_id
  `);
};

export const getEntityHistory = async (
  conn: Connection,
  params: {
    accountId: string;
    historyId: string;
  }
): Promise<EntityVersion[]> => {
  const rows = await conn.any(sql`
    select entity_id, created_by, created_at
    from entities
    where account_id = ${params.accountId} and history_id = ${params.historyId}
    order by created_at
  `);
  return rows.map((row) => ({
    entityId: row["entity_id"] as string,
    createdAt: new Date(row["created_at"] as string),
    createdById: row["created_by"] as string,
  }));
};
