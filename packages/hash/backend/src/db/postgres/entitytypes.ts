import { Connection } from "./types";

import { sql } from "slonik";

/** Get the row ID of an entity type. */
export const getEntityTypeId = async (
  conn: Connection,
  name: string
): Promise<number | null> => {
  const row = await conn.maybeOne(
    sql`select id from entity_types where name = ${name}`
  );
  return row ? (row["id"] as number) : null;
};

/** Create an entity type and return its row ID. */
export const createEntityType = async (
  conn: Connection,
  name: string
): Promise<number> => {
  // The "on conflict do nothing" clause is required here because multiple transactions
  // may try to insert at the same time causing a conflict on the UNIQUE constraint on
  // entity_types name column.
  await conn.query(
    sql`insert into entity_types (name) values (${name}) on conflict do nothing`
  );
  return (await getEntityTypeId(conn, name))!;
};
