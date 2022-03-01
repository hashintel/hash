import { sql, NotFoundError } from "slonik";
import { uniq } from "lodash";

import {
  DBAggregation,
  DBLink,
  DbEntity,
  EntityType,
  EntityVersion,
} from "../adapter";
import { Connection } from "./types";
import { EntityTypePGRow, mapPGRowToEntityType } from "./entitytypes";
import { Visibility } from "../../graphql/apiTypes.gen";
import { genId } from "../../util";
import { insertEntityAccount } from "./account";
import { DbEntityNotFoundError } from "../errors";
import { getEntityOutgoingLinks } from "./link/getEntityOutgoingLinks";
import { addSourceEntityVersionIdToLink } from "./link/util";
import { getEntityIncomingLinks } from "./link/getEntityIncomingLinks";
import { getEntityAggregations } from "./aggregation/getEntityAggregations";
import { addSourceEntityVersionIdToAggregation } from "./aggregation/util";
import { SystemType } from "../../types/entityTypes";
import { requireTransaction } from "./util";

/** Prefix to distinguish identical fields when joining with a type record */
const entityTypeFieldPrefix = "type.";

/** maps a postgres row to its corresponding Entity object */
export const mapPGRowToEntity = (row: EntityPGRow): DbEntity => {
  const entity: Omit<DbEntity, "entityType"> & { entityType?: EntityType } = {
    accountId: row.account_id,
    entityId: row.entity_id,
    entityVersionId: row.entity_version_id,
    entityTypeId: row["type.entity_type_id"],
    entityTypeName:
      row["type.properties"]
        ?.title /** @see https://github.com/gajus/slonik/issues/275 */,
    entityTypeVersionId: row.entity_type_version_id,
    properties: row.properties,
    metadata: {
      versioned: row.versioned,
      extra: row.extra,
    },
    createdAt: new Date(row.created_at),
    createdByAccountId: row.created_by,
    updatedAt: new Date(row.updated_at),
    updatedByAccountId: row.updated_by,
    visibility: Visibility.Public /** @todo implement this */,
  };

  // Pull out the entity type fields to also convert
  const dbEntityType: Record<string, any> = {};
  const dbEntityTypeFields = Object.keys(row).filter((key) =>
    key.startsWith(entityTypeFieldPrefix),
  );
  for (const field of dbEntityTypeFields) {
    dbEntityType[field.slice(entityTypeFieldPrefix.length)] = row[field];
  }
  entity.entityType = mapPGRowToEntityType(dbEntityType as EntityTypePGRow);

  return entity as DbEntity;
};

export type EntityPGRow = {
  // Map all other keys to any for possible entity type fields
  [key: string]: any;
  // Fields that are explicitly defined by the query
  account_id: string;
  entity_version_id: string;
  entity_type_version_id: string;
  properties: any;
  created_by: string;
  created_at: number;
  updated_by: string;
  updated_at: number;
  entity_id: string;
  extra: any;
  versioned: boolean;
  ["type.entity_type_id"]: string;
  ["type.account_id"]: string;
  ["type.entity_type_version_id"]: string;
  ["type.properties"]: any;
  ["type.created_by"]: string;
  ["type.created_at"]: number;
  ["type.updated_by"]: string;
  ["type.updated_at"]: number;
};

/**
 * @todo since many entities will be of the same small number of system types (e.g. block),
 *    for non-nested queries it will probably end up faster to request and cache types separately.
 *    the extra join to get the type's createdAt date seems particularly wasteful.
 */
export const selectEntities = sql<EntityPGRow>`
  select
    e.account_id,
    e.entity_version_id,
    e.entity_type_version_id,
    e.properties,
    e.updated_by,
    e.updated_at,
    e.entity_id,
    meta.extra,
    meta.versioned,
    meta.created_by,
    meta.created_at,

    type.account_id as "type.account_id",
    type.entity_type_id as "type.entity_type_id",
    type.entity_type_version_id as "type.entity_type_version_id",
    type.properties as "type.properties",
    typeMeta.created_by as "type.created_by",
    typeMeta.created_at as "type.created_at",
    typeMeta.name as "type.name",
    typeMeta.versioned as "type.versioned",
    type.updated_at as "type.updated_at",
    type.updated_by as "type.updated_by"
  from
    entity_versions as e
    join entity_type_versions as type on
        e.entity_type_version_id = type.entity_type_version_id
    join entity_types as typeMeta on
        typeMeta.entity_type_id = type.entity_type_id
    join entities as meta on
        e.account_id = meta.account_id and  -- required for sharding
        e.entity_id = meta.entity_id
`;

/** Query for retrieving a specific version of an entity. */
const selectEntityVersion = (params: {
  accountId: string;
  entityVersionId: string;
}) => sql`
  with entities as (${selectEntities})
  select * from entities
  where
    account_id = ${params.accountId}
    and entity_version_id = ${params.entityVersionId}
`;

/** Query for retrieving all versions of an entity */
export const selectEntityAllVersions = (params: {
  accountId: string;
  entityId: string;
}) => sql`
  with entities as (${selectEntities})
  select * from entities
  where
    account_id = ${params.accountId} and entity_id = ${params.entityId}
`;

/** Query for retriveing all versions of multiple entities. */
const selectEntitiesAllVersions = (params: {
  accountId: string;
  entityIds: string[];
}) => sql`
  select * from (${selectEntities}) as entities
  where
    account_id = ${params.accountId}
    and entity_id = any(${sql.array(params.entityIds, "uuid")})
`;

/**
 * Select all entities of the same type,
 * @param params.entityTypeId the entity type id to return entities of
 * @param params.entityTypeVersionId optionally limit to entities of a specific version of a type
 * @param params.accountId the account to retrieve entities from
 * */
export const selectEntitiesByType = (params: {
  entityTypeId: string;
  entityTypeVersionId?: string;
  accountId: string;
}) => {
  const { entityTypeId, entityTypeVersionId, accountId } = params;
  const whereConditions = [sql`type.entity_type_id = ${entityTypeId}`];
  if (entityTypeVersionId) {
    whereConditions.push(
      sql`e.entity_type_version_id = ${entityTypeVersionId}`,
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
 * `undefined` if the entity does not exist in the given account. */
export const getEntity = async (
  conn: Connection,
  params: { accountId: string; entityVersionId: string },
  lock: boolean = false,
): Promise<DbEntity | undefined> => {
  const query = lock
    ? sql`${selectEntityVersion(params)} for update`
    : selectEntityVersion(params);

  const row = await conn.maybeOne<EntityPGRow>(query);
  return row ? mapPGRowToEntity(row) : undefined;
};

/** Get the latest version of an entity. Returns `undefined` if the entity does not
 *  exist in the given account.
 */
export const getEntityLatestVersion = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
  },
): Promise<DbEntity | undefined> => {
  const row = await conn.maybeOne<EntityPGRow>(
    sql`
    with all_matches as (
      ${selectEntityAllVersions(params)}
    )
    select distinct on (entity_id) * from all_matches
    order by entity_id, updated_at desc`,
  );
  return row ? mapPGRowToEntity(row) : undefined;
};

/**
 * Get the latest version of multiple entities from a single account.
 */
const getEntitiesLatestVersion = async (
  conn: Connection,
  params: {
    accountId: string;
    entityIds: string[];
  },
): Promise<DbEntity[]> => {
  const rows = await conn.any<EntityPGRow>(sql`
    select * from (
      select
        *,
        row_number() over (partition by entity_id order by updated_at desc) as rank
      from (${selectEntitiesAllVersions(params)}) as all_matches
    ) as ranking
    where rank = 1;
  `);
  return rows.map(mapPGRowToEntity);
};

/**
 * Get specific versions of multiple entities from a single account.
 */
const getEntityVersions = async (
  conn: Connection,
  params: {
    accountId: string;
    entityVersionIds: string[];
  },
): Promise<DbEntity[]> => {
  const rows = await conn.any<EntityPGRow>(sql`
    with all_matches as (
      ${selectEntities}
    )
    select * from all_matches
    where
      account_id = ${params.accountId}
      and entity_version_id = any(${sql.array(params.entityVersionIds, "uuid")})
  `);
  return rows.map(mapPGRowToEntity);
};

/** Get the ID of the latest version of an entity. Returns `undefined` if the entity
 * does not exist in the given account.
 */
export const getEntityLatestVersionId = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
  },
): Promise<string | undefined> => {
  const id = await conn.maybeOneFirst(
    sql`
    with all_matches as (
      ${selectEntityAllVersions(params)}
    )
    select distinct on (entity_id) entity_version_id from all_matches
    order by entity_id, updated_at desc`,
  );
  return id ? (id as string) : undefined;
};

/**
 * Get the latest version of all entities of a given type.
 * @param params.entityTypeId the entity type id to return entities of
 * @param params.entityTypeVersionId optionally limit to entities of a specific version of a type
 * @param params.accountId the account to retrieve entities from
 */
export const getEntitiesByTypeLatestVersion = async (
  conn: Connection,
  params: {
    entityTypeId: string;
    entityTypeVersionId?: string;
    accountId: string;
  },
): Promise<DbEntity[]> => {
  const rows = await conn.any<EntityPGRow>(sql`
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
 * @param params.accountId the account to retrieve entities from
 */
export const getEntitiesByTypeAllVersions = async (
  conn: Connection,
  params: {
    entityTypeId: string;
    entityTypeVersionId?: string;
    accountId: string;
  },
) => {
  const rows = await conn.any<EntityPGRow>(selectEntitiesByType(params));
  return rows.map(mapPGRowToEntity);
};

/**
 * Get all account type entities (User or Org).
 * @todo check explicitly on the User and Org system types (and add a partial index for speed)
 * */
export const getAllAccounts = async (conn: Connection) => {
  const rows = await conn.any<EntityPGRow>(sql`
    with entities as (${selectEntities})
    -- A partial index exists on entities for account_id = entity_id
    -- Note: assumption is made about accounts having no version history in selectEntities query.
    select * from entities where account_id = entity_id
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
    updatedByAccountId: string;
    updatedAt: Date;
  },
): Promise<void> => {
  await conn.query(sql`
    insert into entity_versions (
      account_id, entity_version_id, entity_id, entity_type_version_id,
      properties, updated_at, updated_by
    )
    values (
      ${params.accountId}, ${params.entityVersionId}, ${params.entityId},
      ${params.entityTypeVersionId}, ${sql.json(params.properties)},
      ${params.updatedAt.toISOString()},
      ${params.updatedByAccountId}
    )
  `);
};

export const updateEntityVersionProperties = async (
  conn: Connection,
  params: {
    accountId: string;
    updatedByAccountId: string;
    updatedAt: Date;
    entityVersionId: string;
    properties: any;
  },
) => {
  await conn.one(sql`
    update entity_versions set
      properties = ${sql.json(params.properties)},
      updated_at = ${params.updatedAt.toISOString()},
      updated_by = ${params.updatedByAccountId}
    where
      account_id = ${params.accountId}
      and entity_version_id = ${params.entityVersionId}
    returning entity_version_id
  `);
};

/** Updates the account id of an entity and its versions for a given entity id.
 * Note: All the versions will be mutated.
 * This query also updates account id in the related links
 */
export const updateEntityAccountId = async (
  existingConnection: Connection,
  {
    originalAccountId,
    entityId,
    newAccountId,
  }: {
    originalAccountId: string;
    entityId: string;
    newAccountId: string;
  },
) => {
  await requireTransaction(existingConnection)(async (conn) => {
    await Promise.all([
      // Deffer constraints on foreign keys so we can update them without issues
      conn.query(sql`
        set constraints
          entity_versions_account_id_entity_id_fk,
          entity_account_account_id_entity_version_id_fk,
          incoming_links_destination_account_id_destination_entity_id_fk,
          incoming_links_source_account_id_link_id_fk
        deferred
      `),
      /** Update the account id in all the entity tables:
       * entity_versions, entity_account, entities
       */
      conn.query(sql`
        update entity_versions set
          account_id = ${newAccountId}
        where
          account_id = ${originalAccountId}
          and entity_id = ${entityId}
      `),
      conn.query(sql`
        update entity_account set
          account_id = ${newAccountId}
        where
          account_id = ${originalAccountId}
          and entity_id = ${entityId}
      `),
      conn.query(sql`
        update entities set
          account_id = ${newAccountId}
        where
          account_id = ${originalAccountId}
          and entity_id = ${entityId}
      `),
      /** Update links and incoming_links account ids */
      conn.query(sql`
        update links set
          source_account_id = ${newAccountId}
        where
          source_account_id = ${originalAccountId}
          and source_entity_id = ${entityId}
      `),
      conn.query(sql`
        update links set
          destination_account_id = ${newAccountId}
        where
          destination_account_id = ${originalAccountId}
          and destination_entity_id = ${entityId}
      `),
      conn.query(sql`
        update incoming_links set
          source_account_id = ${newAccountId}
        where
          source_account_id = ${originalAccountId}
          and link_id in (
            select link_id from links 
            where 
              source_account_id = ${originalAccountId}
              and source_entity_id = ${entityId}
          )
      `),
      conn.query(sql`
        update incoming_links set
          destination_account_id = ${newAccountId}
        where
          destination_account_id = ${originalAccountId}
          and destination_entity_id = ${entityId}
      `),
    ]);
  });
};

export const getEntityHistory = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    order: "asc" | "desc";
  },
): Promise<EntityVersion[]> => {
  const rows = await conn.any(sql`
    select
      entity_version_id, updated_by, updated_at
    from entity_versions
    where
      account_id = ${params.accountId}
      and entity_id = ${params.entityId}
    order by updated_at ${params.order === "asc" ? sql`asc` : sql`desc`}
  `);
  return rows.map((row) => ({
    entityId: params.entityId,
    accountId: params.accountId,
    entityVersionId: row.entity_version_id as string,
    updatedAt: new Date(row.updated_at as string),
    updatedByAccountId: row.updated_by as string,
  }));
};

const filterEntitiesFragment = (
  systemAccountId: string,
  params?: {
    componentId?: string;
    entityTypeId?: string;
    entityTypeVersionId?: string;
    systemTypeName?: SystemType;
  },
) => {
  const { componentId, entityTypeId, entityTypeVersionId, systemTypeName } =
    params ?? {};
  if (componentId) {
    return sql`and properties ->> 'componentId' = ${componentId}`;
  } else if (entityTypeId) {
    return sql`and "type.entity_type_id" = ${entityTypeId}`;
  } else if (entityTypeVersionId) {
    return sql`and entity_type_version_id = ${entityTypeVersionId}`;
  } else if (systemTypeName) {
    return sql`and "type.name" = ${systemTypeName} and "type.account_id" = ${systemAccountId}`;
  }

  return sql``;
};

/**
 * Get all entities associated with a given account ID.
 * Different from `getEntitiesInAccount` since it does not query for specific entities
 * Filters
 */
export const getAccountEntities = async (
  conn: Connection,
  params: {
    systemAccountId: string;
    accountId: string;
    entityTypeFilter?: {
      componentId?: string;
      entityTypeId?: string;
      entityTypeVersionId?: string;
      systemTypeName?: SystemType;
    };
  },
): Promise<DbEntity[]> => {
  const query = sql`
  with uniq as (
    with all_entities as (${selectEntities})
    select distinct on (entity_id) * from all_entities
    where account_id = ${params.accountId} ${filterEntitiesFragment(
    params.systemAccountId,
    params.entityTypeFilter,
  )}
    order by entity_id, updated_at desc)
  select * from uniq 
  order by updated_at desc`;

  const rows = await conn.any<EntityPGRow>(query);

  return rows.map(mapPGRowToEntity);
};

/**
 * Get multiple entities from a given account. If `entityVersionId` is not set, the
 * function retrieves the latest version of that entity, otherwise it retrieves the
 * specific version requested.
 */
const getEntitiesInAccount = async (
  conn: Connection,
  params: {
    accountId: string;
    ids: { entityId: string; entityVersionId?: string }[];
  },
) => {
  const { accountId } = params;

  const latestEntities = params.ids
    .filter((id) => !id.entityVersionId)
    .map((id) => id.entityId);

  const versionEntities = params.ids
    .filter((id) => id.entityVersionId)
    .map((id) => id.entityVersionId!);

  return (
    await Promise.all([
      getEntitiesLatestVersion(conn, { accountId, entityIds: latestEntities }),
      getEntityVersions(conn, { accountId, entityVersionIds: versionEntities }),
    ])
  ).flat();
};

/** Get multiple entities in a single query. If `entityVersionId` is not set, the
 * function retrieves the latest version of that entity, otherwise it retrieves the
 * specific version requested. The array returned is in the same sort order as `ids`.
 */
export const getEntities = async (
  conn: Connection,
  ids: { accountId: string; entityId: string; entityVersionId?: string }[],
): Promise<DbEntity[]> => {
  // Need to group by account ID to use the index
  const idsByAccount = new Map<
    string,
    { entityId: string; entityVersionId?: string }[]
  >();
  for (const { entityId, entityVersionId, accountId } of ids) {
    if (idsByAccount.has(accountId)) {
      idsByAccount.get(accountId)!.push({ entityId, entityVersionId });
    } else {
      idsByAccount.set(accountId, [{ entityId, entityVersionId }]);
    }
  }

  const entities = (
    await Promise.all(
      Array.from(idsByAccount.entries()).map(([accountId, idsInAccount]) =>
        getEntitiesInAccount(conn, { accountId, ids: idsInAccount }),
      ),
    )
  ).flat();

  // Sort the result from the DB to be in the same order as `ids`
  const versionLookup = new Map<string, DbEntity>();
  const latestLookup = new Map<string, DbEntity>();
  for (const entity of entities) {
    versionLookup.set(entity.entityVersionId, entity);
    const latest = latestLookup.get(entity.entityId);
    if (!latest) {
      latestLookup.set(entity.entityId, entity);
    } else if (latest.updatedAt < entity.updatedAt) {
      latestLookup.set(entity.entityId, entity);
    }
  }
  return ids
    .map((id) =>
      id.entityVersionId
        ? versionLookup.get(id.entityVersionId)
        : latestLookup.get(id.entityId),
    )
    .filter((entity): entity is DbEntity => !!entity);
};

// Convert a string to a numeric hash code.
const hashCode = (str: string) => {
  let hash = 0;
  if (str.length === 0) {
    return hash;
  }
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = (hash << 5) - hash + chr;
    // eslint-disable-next-line no-bitwise
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

/**
 * Acquire a transaction-level advisory lock on a given entity ID. The lock is
 * automatically released when the transaction ends.
 * See: https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS
 * */
export const acquireEntityLock = async (
  conn: Connection,
  params: { entityId: string },
) =>
  // pg_advisory_xact_lock requires an integer so pass it a hash of the entity ID.
  conn
    .query(sql`select pg_advisory_xact_lock(${hashCode(params.entityId)})`)
    .then((_) => null);

const addSourceEntityVersionIdToAggregations = async (
  conn: Connection,
  params: {
    entity: DbEntity;
    omittedAggregations?: {
      sourceAccountId: string;
      sourceEntityId: string;
      path: string;
    }[];
    newSourceEntityVersionId: string;
  },
) => {
  const { entity } = params;

  const aggregations = await getEntityAggregations(conn, {
    sourceAccountId: entity.accountId,
    sourceEntityId: entity.entityId,
    sourceEntityVersionId: entity.entityVersionId,
  });

  const isDbAggregationInNextVersion = (aggregation: DBAggregation): boolean =>
    params.omittedAggregations?.find(
      ({ path }) => path === aggregation.path,
    ) === undefined;

  const { newSourceEntityVersionId } = params;

  await Promise.all(
    aggregations
      .filter(isDbAggregationInNextVersion)
      .map(({ sourceAccountId, sourceEntityId, path }) =>
        addSourceEntityVersionIdToAggregation(conn, {
          sourceAccountId,
          sourceEntityId,
          path,
          newSourceEntityVersionId,
        }),
      ),
  );
};

const addSourceEntityVersionIdToOutgoingLinks = async (
  conn: Connection,
  params: {
    entity: DbEntity;
    omittedOutgoingLinks?: { sourceAccountId: string; linkId: string }[];
    newSourceEntityVersionId: string;
  },
) => {
  const { entity } = params;

  const outgoingLinks = await getEntityOutgoingLinks(conn, {
    accountId: entity.accountId,
    entityId: entity.entityId,
    entityVersionId: entity.entityVersionId,
  });

  const isDbLinkInNextVersion = (link: DBLink): boolean =>
    params.omittedOutgoingLinks?.find(
      ({ linkId }) => link.linkId === linkId,
    ) === undefined;

  const { newSourceEntityVersionId } = params;

  await Promise.all(
    outgoingLinks
      .filter(isDbLinkInNextVersion)
      .map(({ sourceAccountId, linkId }) =>
        addSourceEntityVersionIdToLink(conn, {
          sourceAccountId,
          linkId,
          newSourceEntityVersionId,
        }),
      ),
  );
};

/** Update the properties of the provided entity by creating a new version.
 * @throws `DbEntityNotFoundError` if the entity does not exist.
 * @throws `DbInvalidLinksError` if the entity's new properties link to an entity which
 *          does not exist.
 */
export const updateVersionedEntity = async (
  conn: Connection,
  params: {
    entity: DbEntity;
    properties: any;
    updatedByAccountId: string;
    omittedOutgoingLinks?: { sourceAccountId: string; linkId: string }[];
    omittedAggregations?: {
      sourceAccountId: string;
      sourceEntityId: string;
      path: string;
    }[];
  },
) => {
  const { entity, properties } = params;
  if (!params.entity.metadata.versioned) {
    throw new Error("cannot create new version of non-versioned entity");
  }

  const now = new Date();
  const newEntityVersion: DbEntity = {
    ...params.entity,
    entityVersionId: genId(),
    properties,
    updatedAt: now,
    updatedByAccountId: params.updatedByAccountId,
  };

  // Lock the entity to ensure no other transaction may update it concurrently until
  // this transaction completes.
  await acquireEntityLock(conn, { entityId: entity.entityId });

  // Defer FKs until end of transaction so we can insert concurrently
  /** @todo: only defer violated FKs */
  await conn.query(sql`
    set constraints
      entity_account_account_id_entity_version_id_fk,
      incoming_links_destination_account_id_destination_entity_id_fk,
      incoming_links_source_account_id_link_id_fk
    deferred
  `);

  const { omittedOutgoingLinks, omittedAggregations } = params;

  await Promise.all([
    insertEntityVersion(conn, newEntityVersion),

    addSourceEntityVersionIdToOutgoingLinks(conn, {
      entity,
      omittedOutgoingLinks,
      newSourceEntityVersionId: newEntityVersion.entityVersionId,
    }),
    addSourceEntityVersionIdToAggregations(conn, {
      entity,
      omittedAggregations,
      newSourceEntityVersionId: newEntityVersion.entityVersionId,
    }),

    // Make a reference to this entity's account in the `entity_account` lookup table
    insertEntityAccount(conn, newEntityVersion),
  ]);

  return newEntityVersion;
};

const updateNonVersionedEntity = async (
  conn: Connection,
  params: {
    entity: DbEntity;
    properties: any;
    updatedByAccountId: string;
  },
): Promise<DbEntity> => {
  if (params.entity.metadata.versioned) {
    throw new Error("cannot mutate a versioned entity");
  }

  const updatedEntity: DbEntity = {
    ...params.entity,
    updatedAt: new Date(),
    updatedByAccountId: params.updatedByAccountId,
    properties: params.properties,
  };

  try {
    await updateEntityVersionProperties(conn, updatedEntity);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new DbEntityNotFoundError(params.entity);
    }
    throw err;
  }

  return updatedEntity;
};

/** Update an entity, either versioned or non-versioned. Note: the update is applied
 * to the latest version of the entity.
 * @throws `DbEntityNotFoundError` if the entity does not exist.
 * @throws `DbInvalidLinksError` if the entity's new properties link to an entity which
 *          does not exist.
 */
export const updateEntity = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    properties: any;
    updatedByAccountId: string;
  },
): Promise<DbEntity> => {
  const { accountId, entityId, properties } = params;
  const entity = await getEntityLatestVersion(conn, params);
  if (!entity) {
    throw new DbEntityNotFoundError({ accountId, entityId });
  }

  // @todo validate new entity properties against the schema of its entityType
  const updateData = {
    entity,
    properties,
    updatedByAccountId: params.updatedByAccountId,
  };
  return entity.metadata.versioned
    ? updateVersionedEntity(conn, updateData)
    : updateNonVersionedEntity(conn, updateData);
};

export const getDestinationEntityOfLink = async (
  conn: Connection,
  link: DBLink,
): Promise<DbEntity> => {
  const destinationEntity = link.destinationEntityVersionId
    ? await getEntity(conn, {
        accountId: link.destinationAccountId,
        entityVersionId: link.destinationEntityVersionId,
      })
    : await getEntityLatestVersion(conn, {
        accountId: link.destinationAccountId,
        entityId: link.destinationEntityId,
      });

  if (!destinationEntity) {
    throw new DbEntityNotFoundError({
      accountId: link.destinationAccountId,
      entityId: link.destinationEntityId,
      entityVersionId: link.destinationEntityVersionId,
    });
  }

  return destinationEntity;
};

export const getAncestorReferences = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    depth?: number;
  },
) => {
  // @todo: this implementation cannot handle cycles in the graph.
  if (params.depth !== undefined && params.depth < 1) {
    throw new Error("parameter depth must be at least 1");
  }
  const depth = params.depth || 1;
  let refs = [{ accountId: params.accountId, entityId: params.entityId }];
  for (let i = 0; i < depth; i++) {
    const incomingLinks = await Promise.all(
      refs.map((ref) => getEntityIncomingLinks(conn, ref)),
    );

    const incomingRefs = incomingLinks
      .flat()
      .map(({ sourceAccountId, sourceEntityId }) => ({
        accountId: sourceAccountId,
        entityId: sourceEntityId,
      }));

    refs = uniq(incomingRefs.flat());
  }
  return refs;
};

export const getChildren = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    entityVersionId: string;
  },
): Promise<DbEntity[]> => {
  if (!(await getEntity(conn, params))) {
    throw new DbEntityNotFoundError(params);
  }

  const outgoing = await getEntityOutgoingLinks(conn, params);

  return Promise.all(
    outgoing.map(async (link) => getDestinationEntityOfLink(conn, link)),
  );
};
