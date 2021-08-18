import { Entity, EntityVersion } from "../adapter";
import { Connection } from "./types";

import { sql, QueryResultRowType } from "slonik";

/** maps a postgres row to its corresponding Entity object */
export const mapPGRowToEntity = (row: QueryResultRowType): Entity => ({
  accountId: row["account_id"] as string,
  entityVersionId: row["entity_version_id"] as string,
  createdById: row["created_by"] as string,
  type: row["type"] as string,
  properties: row["properties"],
  metadata: {
    metadataId: row["entity_id"] as string,
    versioned: row["versioned"] as boolean,
    extra: row["extra"],
  },
  metadataId: row["entity_id"] as string,
  createdAt: new Date(row["created_at"] as number),
  updatedAt: new Date(row["updated_at"] as number),
});

export const selectEntities = sql`
  select
    e.account_id, e.entity_version_id, t.name as type, e.properties, e.created_by,
    e.created_at, e.updated_at, e.entity_id, meta.extra, meta.versioned
  from
    entity_versions as e
    join entity_types as t on e.type = t.id
    join entities as meta on
        e.account_id = meta.account_id and  -- required for sharding
        e.entity_id = meta.entity_id
`;

/** Query for retrieving a specific version of an entity. */
const selectEntityVersion = (params: {
  accountId: string;
  entityVersionId: string;
}) => sql`
  ${selectEntities}
  where
    e.account_id = ${params.accountId}
    and e.entity_version_id = ${params.entityVersionId}
`;

/** Query for retrieving all versions of an entity */
const selectEntityAllVersions = (params: {
  accountId: string;
  metadataId: string;
}) => sql`
  ${selectEntities}
  where
    e.account_id = ${params.accountId} and e.entity_id = ${params.metadataId}
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
  params: { accountId: string; entityVersionId: string },
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
    select distinct on (entity_id) * from all_matches
    order by entity_id, updated_at desc`
  );
  return row ? mapPGRowToEntity(row) : undefined;
};

/** Get the ID of the latest version of an entity. Returns `undefined` if the entity
 * does not exist in the given account.
 */
export const getLatestEntityVersionId = async (
  conn: Connection,
  params: {
    accountId: string;
    metadataId: string;
  }
): Promise<string | undefined> => {
  const id = await conn.maybeOneFirst(
    sql`
    with all_matches as (
      ${selectEntityAllVersions(params)}
    )
    select distinct on (entity_id) entity_version_id from all_matches
    order by entity_id, updated_at desc`
  );
  return id ? (id as string) : undefined;
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
    select distinct on (entity_id) * from all_matches
    order by entity_id, updated_at desc
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
    where e.account_id = e.entity_version_id
  `);
  return rows.map(mapPGRowToEntity);
};

export const insertEntityVersion = async (
  conn: Connection,
  params: {
    accountId: string;
    entityVersionId: string;
    typeId: number;
    properties: any;
    metadataId: string;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<void> => {
  await conn.query(sql`
    insert into entity_versions (
      account_id, entity_version_id, type, properties, entity_id, created_by,
      created_at, updated_at
    )
    values (
      ${params.accountId}, ${params.entityVersionId}, ${params.typeId},
      ${sql.json(params.properties)}, ${params.metadataId},
      ${params.createdById}, ${params.createdAt.toISOString()},
      ${params.updatedAt.toISOString()})
  `);
};

export const updateEntityVersionProperties = async (
  conn: Connection,
  params: {
    accountId: string;
    entityVersionId: string;
    properties: any;
    updatedAt: Date;
  }
) => {
  await conn.one(sql`
    update entity_versions
      set properties = ${sql.json(params.properties)},
      updated_at = ${params.updatedAt.toISOString()}
    where
      account_id = ${params.accountId}
      and entity_version_id = ${params.entityVersionId}
    returning entity_version_id
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
      entity_version_id, created_by, created_at
    from entity_versions
    where
      account_id = ${params.accountId}
      and entity_id = ${params.metadataId}
    order by created_at desc
  `);
  return rows.map((row) => ({
    entityVersionId: row["entity_version_id"] as string,
    createdAt: new Date(row["created_at"] as string),
    createdById: row["created_by"] as string,
  }));
};

const getEntitiesInAccount = async (
  conn: Connection,
  params: { accountId: string; versionIds: string[] }
) => {
  const rows = await conn.any(sql`
    select * from (${selectEntities}) as entities
    where
      account_id = ${params.accountId}
      and entity_version_id = any(${sql.array(params.versionIds, "uuid")})
  `);
  return rows.map(mapPGRowToEntity);
};

/** Get multiple entities in a single query. */
export const getEntities = async (
  conn: Connection,
  ids: { entityVersionId: string; accountId: string }[]
): Promise<Entity[]> => {
  // Need to group by account ID to use the index
  const idsByAccount = new Map<string, string[]>();
  for (const { entityVersionId: versionId, accountId } of ids) {
    if (idsByAccount.has(accountId)) {
      idsByAccount.get(accountId)?.push(versionId);
    } else {
      idsByAccount.set(accountId, [versionId]);
    }
  }

  const entities = (
    await Promise.all(
      Array.from(idsByAccount.entries()).map(
        async ([accountId, versionIds]) =>
          await getEntitiesInAccount(conn, { accountId, versionIds })
      )
    )
  ).flat();

  // Need to sort the result from the DB to be in the same order as `ids`
  const entityMap = new Map<string, Entity>();
  entities.forEach((entity) => entityMap.set(entity.entityVersionId, entity));
  return ids.map(({ entityVersionId: versionId }) => entityMap.get(versionId)!);
};
