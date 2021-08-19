import { sql, QueryResultRowType } from "slonik";

import { Entity, EntityType, EntityVersion } from "../adapter";
import { Connection } from "./types";

import { mapPGRowToEntityType } from "./entitytypes";
import { Visibility } from "../../graphql/apiTypes.gen";

/** Prefix to distinguish identical fields when joining with a type record */
const entityTypeFieldPrefix = "type.";

/** maps a postgres row to its corresponding Entity object */
export const mapPGRowToEntity = (row: QueryResultRowType): Entity => {
  const entity: Omit<Entity, "entityType"> & { entityType?: EntityType } = {
    accountId: row["account_id"] as string,
    entityId: row["entity_id"] as string,
    entityVersionId: row["entity_version_id"] as string,
    createdById: row["created_by"] as string,
    entityTypeId: row["type.entity_type_id"] as string,
    entityTypeName: (row["type.properties"] as any)
      ?.title /** @see https://github.com/gajus/slonik/issues/275 */,
    entityTypeVersionId: row["entity_type_version_id"] as string,
    id: row["entity_id"] as string,
    properties: row["properties"],
    metadata: {
      metadataId: row["entity_id"] as string,
      versioned: row["versioned"] as boolean,
      extra: row["extra"],
    },
    metadataId: row["entity_id"] as string,
    createdAt: new Date(row["created_at"] as number),
    updatedAt: new Date(row["updated_at"] as number),
    visibility: Visibility.Public /** @todo implement this */,
  };

  // Pull out the entity type fields to also convert
  const dbEntityType: Record<string, any> = {};
  const dbEntityTypeFields = Object.keys(row).filter((key) =>
    key.startsWith(entityTypeFieldPrefix)
  );
  for (const field of dbEntityTypeFields) {
    dbEntityType[field.slice(entityTypeFieldPrefix.length)] = row[field];
  }
  entity.entityType = mapPGRowToEntityType(dbEntityType);

  return entity as Entity;
};

/**
 * @todo since many entities will be of the same small number of system types (e.g. block),
 *    for non-nested queries it will probably end up faster to request and cache types separately.
 */
export const selectEntities = sql`
  select
    e.account_id, e.entity_version_id, e.entity_type_version_id,
    e.properties, e.created_by, e.created_at, e.updated_at, 
    e.entity_id, meta.extra, meta.versioned,
    
    type.account_id as ${sql.identifier([
      `${entityTypeFieldPrefix}account_id`,
    ])}, 
    type.entity_type_id as ${sql.identifier([
      `${entityTypeFieldPrefix}entity_type_id`,
    ])}, 
    type.entity_type_version_id as ${sql.identifier([
      `${entityTypeFieldPrefix}entity_type_version_id`,
    ])}, 
    type.properties as ${sql.identifier([
      `${entityTypeFieldPrefix}properties`,
    ])}, 
    type.created_by as ${sql.identifier([
      `${entityTypeFieldPrefix}created_by`,
    ])}, 
    type.created_at as ${sql.identifier([
      `${entityTypeFieldPrefix}created_at`,
    ])}, 
    type.updated_at as ${sql.identifier([`${entityTypeFieldPrefix}updated_at`])}
  from
    entity_versions as e
    join entity_type_versions as type on 
        e.entity_type_version_id = type.entity_type_version_id
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

/**
 * Select all entities of the same type,
 * @param params.entityTypeId the entity type id to return entities of
 * @param params.entityTypeVersionId optionally limit to entities of a specific version of a type
 * @param params.accountId optionally limit to entities from a specific account
 **/
const selectEntitiesByType = (params: {
  entityTypeId: string;
  entityTypeVersionId?: string;
  accountId?: string;
}) => {
  const { entityTypeId, entityTypeVersionId, accountId } = params;
  const whereConditions = [sql`type.entity_type_id = ${entityTypeId}`];
  if (entityTypeVersionId) {
    whereConditions.push(
      sql`e.entity_type_version_id = ${entityTypeVersionId}`
    );
  }
  if (accountId) {
    whereConditions.push(sql`e.account_id = ${accountId}`);
  }
  return sql`
    ${selectEntities}
      where ${sql.join(whereConditions, sql` and `)}
  `;
};

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
export const getEntityLatestVersion = async (
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
export const getEntityLatestVersionId = async (
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

/**
 * Get the latest version of all entities of a given type.
 * @param params.entityTypeId the entity type id to return entities of
 * @param params.entityTypeVersionId optionally limit to entities of a specific version of a type
 * @param params.accountId optionally limit to entities from a specific account
 */
export const getEntitiesByTypeLatestVersion = async (
  conn: Connection,
  params: {
    entityTypeId: string;
    entityTypeVersionId?: string;
    accountId?: string;
  }
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

/**
 * Get all versions of all entities of a given type.
 * @param params.entityTypeId the entity type id to return entities of
 * @param params.entityTypeVersionId optionally limit to entities of a specific version of a type
 * @param params.accountId optionally limit to entities from a specific account
 */
export const getEntitiesByTypeAllVersions = async (
  conn: Connection,
  params: {
    entityTypeId: string;
    entityTypeVersionId?: string;
    accountId?: string;
  }
) => {
  const rows = await conn.any(selectEntitiesByType(params));
  return rows.map(mapPGRowToEntity);
};

/**
 * Get all account type entities (User or Org).
 * @todo check explicitly on the User and Org system types (and add a partial index for speed)
 * */
export const getAccountEntities = async (conn: Connection) => {
  const rows = await conn.any(sql`
    ${selectEntities}
    where e.account_id = e.entity_id
  `);
  return rows.map(mapPGRowToEntity);
};

export const insertEntityVersion = async (
  conn: Connection,
  params: {
    accountId: string;
    entityVersionId: string;
    entityId: string;
    entityTypeVersionId: string;
    properties: any;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<void> => {
  await conn.query(sql`
    insert into entity_versions (
      account_id, entity_version_id, entity_id, 
      entity_type_version_id, properties,
      created_by, created_at, updated_at
    )
    values (
      ${params.accountId}, ${params.entityVersionId}, ${params.entityId},
      ${params.entityTypeVersionId}, ${sql.json(params.properties)}, 
      ${
        params.createdById
      }, ${params.createdAt.toISOString()}, ${params.updatedAt.toISOString()})
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
