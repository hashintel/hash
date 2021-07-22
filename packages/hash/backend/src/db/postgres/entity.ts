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
  metadata: {
    metadataId: row["metadata_id"] as string,
    versioned: row["versioned"] as boolean,
    extra: row["extra"],
  },
  metadataId: row["metadata_id"] as string,
  createdAt: new Date(row["created_at"] as number),
  updatedAt: new Date(row["updated_at"] as number),
});

export const selectEntities = sql`
  select
    e.account_id, e.entity_id, t.name as type, e.properties, e.created_by,
    e.created_at, e.updated_at, e.metadata_id, meta.extra, meta.versioned
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
  const rows = await conn.any(sql`
    with all_matches as (
      ${selectEntitiesByType(params)}
    )
    select distinct on (metadata_id) * from all_matches
    order by metadata_id, updated_at desc
  `);
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
    metadataId: string;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<void> => {
  await conn.query(sql`
    insert into entities (
      account_id, entity_id, type, properties, metadata_id, created_by,
      created_at, updated_at
    )
    values (
      ${params.accountId}, ${params.entityId}, ${params.typeId},
      ${sql.json(params.properties)}, ${params.metadataId},
      ${params.createdById}, ${params.createdAt.toISOString()},
      ${params.updatedAt.toISOString()})
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
    metadataId: string;
  }
): Promise<EntityVersion[]> => {
  const rows = await conn.any(sql`
    select
      entity_id, created_by, created_at
    from entities
    where
      account_id = ${params.accountId}
      and metadata_id = ${params.metadataId}
    order by created_at desc
  `);
  return rows.map((row) => ({
    entityId: row["entity_id"] as string,
    createdAt: new Date(row["created_at"] as string),
    createdById: row["created_by"] as string,
  }));
};

const getEntitiesInAccount = async (
  conn: Connection,
  params: { accountId: string; entityIds: string[] }
) => {
  const rows = await conn.any(sql`
    select * from (${selectEntities}) as entities
    where
      account_id = ${params.accountId}
      and entity_id = any(${sql.array(params.entityIds, "uuid")})
  `);
  return rows.map(mapPGRowToEntity);
};

/** Get multiple entities in a single query. */
export const getEntities = async (
  conn: Connection,
  ids: { entityId: string; accountId: string }[]
) => {
  // Need to group by account ID to use the index
  const idsByAccount = new Map<string, string[]>();
  for (const { entityId, accountId } of ids) {
    if (idsByAccount.has(accountId)) {
      idsByAccount.get(accountId)?.push(entityId);
    } else {
      idsByAccount.set(accountId, [entityId]);
    }
  }

  return (
    await Promise.all(
      Array.from(idsByAccount.entries()).map(
        async ([accountId, entityIds]) =>
          await getEntitiesInAccount(conn, { accountId, entityIds })
      )
    )
  ).flat();
};
