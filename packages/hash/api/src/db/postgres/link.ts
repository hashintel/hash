import { sql } from "slonik";
import { uniq } from "lodash";

import { Connection } from "./types";
import { Entity } from "../adapter";
import { gatherLinks } from "./util";
import { getEntityAccountIdMany } from "./account";
import { DbInvalidLinksError } from "../errors";
import { getEntity, getEntityLatestVersion } from "./entity";
import { DbEntityNotFoundError } from "..";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/** Insert multiple rows into the outgoing_links table. This function is idempotent. */
export const insertOutgoingLinks = async (
  conn: Connection,
  links: {
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionId: string;
    destinationAccountId: string;
    destinationEntityId: string;
    destinationEntityVersionId?: string;
  }[],
) => {
  const rows = links.map((link) => [
    link.sourceAccountId,
    link.sourceEntityId,
    link.destinationAccountId,
    link.destinationEntityId,
    link.destinationEntityVersionId ?? ZERO_UUID,
    link.sourceEntityVersionId,
  ]);
  await conn.query(sql`
    insert into outgoing_links as l (
      source_account_id, source_entity_id, destination_account_id, destination_entity_id,
      destination_entity_version_id, source_entity_version_ids
    )
    select
      source_account_id,
      source_entity_id,
      destination_account_id,
      destination_entity_id,
      destination_entity_version_id,
      array[source_entity_version_id] as source_entity_version_ids
    from (
      select * from ${sql.unnest(rows, [
        "uuid",
        "uuid",
        "uuid",
        "uuid",
        "uuid",
        "uuid",
      ])} as rows (
        source_account_id, source_entity_id, destination_account_id, destination_entity_id,
        destination_entity_version_id, source_entity_version_id
      )
    ) as rows
    on conflict on constraint outgoing_links_pk do update
    set
      source_entity_version_ids = l.source_entity_version_ids || EXCLUDED.source_entity_version_ids
    where
      not l.source_entity_version_ids @> EXCLUDED.source_entity_version_ids
  `);
};

/** Insert multiple rows into the incoming_links table. This function is idempotent. */
export const insertIncomingLinks = async (
  conn: Connection,
  links: {
    destinationAccountId: string;
    destinationEntityId: string;
    sourceAccountId: string;
    sourceEntityId: string;
  }[],
) => {
  const rows = links.map((link) => [
    link.destinationAccountId,
    link.destinationEntityId,
    link.sourceAccountId,
    link.sourceEntityId,
  ]);
  await conn.query(sql`
    insert into incoming_links as l (
      destination_account_id, destination_entity_id, source_account_id, source_entity_id
    )
    select * from ${sql.unnest(rows, ["uuid", "uuid", "uuid", "uuid"])}
    on conflict on constraint incoming_links_pk do nothing
  `);
};

/** Insert the link references made by the provided `entity` into the
 * `incoming_links` and `outgoing_links` tables. Throws a `DbInalidLinksError` if `entity`
 * contains a link to another entity which does not exist. */
export const insertLinks = async (conn: Connection, entity: Entity) => {
  const linkedEntities = gatherLinks(entity);
  if (linkedEntities.length === 0) {
    return;
  }
  const links = await getEntityAccountIdMany(conn, { ids: linkedEntities });

  if (links.length !== linkedEntities.length) {
    // At least one link points to an entity which does not exist.
    const missing = linkedEntities
      .map(({ entityId, entityVersionId }) => {
        const found = links.find(
          (link) =>
            link.entityId === entityId &&
            link.entityVersionId === entityVersionId,
        );
        return found ? null : { entityId, entityVersionId };
      })
      .filter((it) => it)
      .map((it) => it!);
    throw new DbInvalidLinksError({ entity, invalid: missing });
  }

  await Promise.all([
    insertOutgoingLinks(
      conn,
      links.map((link) => ({
        sourceAccountId: entity.accountId,
        sourceEntityId: entity.entityId,
        sourceEntityVersionId: entity.entityVersionId,
        destinationAccountId: link.accountId,
        destinationEntityId: link.entityId,
        destinationEntityVersionId: link.entityVersionId,
      })),
    ),

    insertIncomingLinks(
      conn,
      links.map((link) => ({
        destinationAccountId: link.accountId,
        destinationEntityId: link.entityId,
        sourceAccountId: entity.accountId,
        sourceEntityId: entity.entityId,
      })),
    ),
  ]);
};

export type OutgoingLink = {
  accountId: string;
  entityId: string;
  entityVersionId?: string;
  validForSourceEntityVersionIds: Set<string>;
};

/** Get the outgoing links made by an entity. Returns an array of objects with the
 * following fields:
 *   1. `accountId`: the account ID of the linked entity
 *   2. `entityId`: the entity ID of the linked entity
 *   3. `entityVersionId`: `undefined` if the link does not specify a specific version ID
 *   4. `validForSourceEntityVersionIds`: a `Set` of version IDs for `params.entityId` for
 *       which the link is valid.
 */
export const getEntityOutgoingLinks = async (
  conn: Connection,
  params: { accountId: string; entityId: string },
): Promise<OutgoingLink[]> => {
  const rows = await conn.any(sql`
    select
      destination_account_id, destination_entity_id, destination_entity_version_id, source_entity_version_ids
    from
      outgoing_links
    where
      source_account_id = ${params.accountId}
      and source_entity_id = ${params.entityId}
  `);
  return rows.map((row) => {
    const destinationEntityVersionId =
      row.destination_entity_version_id as string;
    return {
      accountId: row.destination_account_id as string,
      entityId: row.destination_entity_id as string,
      entityVersionId:
        destinationEntityVersionId === ZERO_UUID
          ? undefined
          : destinationEntityVersionId,
      // The version IDs of `params.entityId` for which this link is valid
      validForSourceEntityVersionIds: new Set(
        row.source_entity_version_ids as string[],
      ),
    };
  });
};

/** Get the accountId and entityId of all entities which link to a given entity. */
const getEntityIncomingLinks = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
  },
) => {
  const rows = await conn.any(sql`
    select
      source_account_id, source_entity_id
    from
      incoming_links
    where
      destination_account_id = ${params.accountId}
      and destination_entity_id = ${params.entityId}
  `);
  return rows.map((row) => ({
    accountId: row.source_account_id as string,
    entityId: row.source_entity_id as string,
  }));
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
    const incoming = await Promise.all(
      refs.map((ref) => getEntityIncomingLinks(conn, ref)),
    );
    refs = uniq(incoming.flat());
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
): Promise<Entity[]> => {
  if (!(await getEntity(conn, params))) {
    throw new DbEntityNotFoundError(params);
  }
  // @todo: could include this `filter` in the `where` clause of the query instead
  const outgoing = (await getEntityOutgoingLinks(conn, params)).filter((link) =>
    link.validForSourceEntityVersionIds.has(params.entityVersionId),
  );

  return Promise.all(
    outgoing.map(async (link) => {
      const entity = link.entityVersionId
        ? await getEntity(conn, {
            accountId: link.accountId,
            entityVersionId: link.entityVersionId!,
          })
        : await getEntityLatestVersion(conn, link);
      if (!entity) {
        throw new DbEntityNotFoundError(link);
      }
      return entity;
    }),
  );
};
