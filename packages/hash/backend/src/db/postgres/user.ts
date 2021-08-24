import { sql } from "slonik";

import { Connection } from "./types";
import { mapPGRowToEntity, selectEntities } from "./entity";
import { selectSystemEntityTypeIds } from "./entitytypes";

const matchesUserType = sql`
  (
    select entity_type_id
    from entity_type_versions as ver
    where ver.entity_type_version_id = e.entity_type_version_id
    limit 1
  ) in ( ${selectSystemEntityTypeIds({ systemTypeName: "User" })} )
`;

// @todo: this function should take accountId as a parameter.
export const getUserById = async (conn: Connection, params: { id: string }) => {
  const row = await conn.one(sql`
    ${selectEntities}
    where
      e.entity_id = ${params.id} and ${matchesUserType}
  `);
  return mapPGRowToEntity(row);
};

// @todo: this function is not optimized to take DB indexes or sharding into account. It
//    might be better to have a separate "users" table.
export const getUserByEmail = async (
  conn: Connection,
  params: { email: string }
) => {
  const row = await conn.one(sql`
    ${selectEntities}
    where
      e.properties ->> 'email' = ${params.email} and ${matchesUserType}
  `);
  return mapPGRowToEntity(row);
};

// @todo: this function is not optimized to take DB indexes or sharding into account. It
//    might be better to have a separate "users" table.
export const getUserByShortname = async (
  conn: Connection,
  params: { shortname: string }
) => {
  const row = await conn.one(sql`
    ${selectEntities}
    where
      e.properties ->> 'shortname' = ${params.shortname} and ${matchesUserType}
  `);
  return mapPGRowToEntity(row);
};
