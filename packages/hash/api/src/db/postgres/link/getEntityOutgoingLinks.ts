import {
  QueryResultRowType,
  sql,
  TaggedTemplateLiteralInvocationType,
} from "slonik";
import { EntityWithOutgoingEntityIds } from "../../adapter";
import { EntityPGRow, mapPGRowToEntity, selectEntities } from "../entity";

import { Connection } from "../types";
import { getLinks } from "./util";

export type EntityWithOutgoingEntityIdsPGRow = EntityPGRow & {
  outgoing_entity_ids: string[];
};

/** maps a postgres row with parent to its corresponding EntityWithOutgoingEntityIds object */
export const mapEntityWithOutgoingEntityIdsPGRowToEntity = (
  row: EntityWithOutgoingEntityIdsPGRow,
): EntityWithOutgoingEntityIds => ({
  ...mapPGRowToEntity(row),
  outgoingEntityIds: row.outgoing_entity_ids,
});

export const getEntityOutgoingLinks = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
    activeAt?: Date;
    path?: string;
  },
) => {
  const dbLinks = await getLinks(conn, {
    sourceAccountId: params.accountId,
    sourceEntityId: params.entityId,
    activeAt: params.activeAt,
    path: params.path,
  });

  return dbLinks;
};

const outgoingLinkAggregationQuery = sql`
  select array_agg(destination_entity_id) as outgoing_entity_ids from links
    inner join distinct_entitites as de on destination_entity_id = de.entity_id
    where a.entity_version_id = ANY(links.source_entity_version_ids) 
      and a.entity_id = source_entity_id 
      and de.entity_type_version_id = a.entity_type_version_id
    group by a.entity_id
    `;

const entitiesOutgoingLinksQuery = (
  selector: TaggedTemplateLiteralInvocationType<QueryResultRowType>,
) =>
  sql`
    with all_matches as (
      ${selector}
    )
    , distinct_entitites as (select distinct on (entity_id) * from all_matches order by entity_id, updated_at desc)
    select * from distinct_entitites as a
    left join lateral (${outgoingLinkAggregationQuery}) as l on true
  `;

/**
 * Get the latest version of a given entity and all outgoing link ids with a matching entity type.
 * @param params.accountId the account to retrieve entities from
 * @param params.entityId entityId of source entity.
 */
export const getEntityWithOutgoingEntityIds = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
  },
): Promise<EntityWithOutgoingEntityIds | null> => {
  const row = await conn.maybeOne<EntityWithOutgoingEntityIdsPGRow>(
    sql`${entitiesOutgoingLinksQuery(selectEntities)}
      where account_id = ${params.accountId} 
        and entity_id = ${params.entityId}
      limit 1`,
  );
  return row ? mapEntityWithOutgoingEntityIdsPGRowToEntity(row) : null;
};
