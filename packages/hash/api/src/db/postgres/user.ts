import { sql } from "slonik";

import { Connection } from "./types";
import { EntityPGRow, mapPGRowToEntity, selectEntities } from "./entity";
import { selectSystemEntityTypeIds } from "./entitytypes";

const matchesUserType = sql`
  (
    select entity_type_id
    from entity_type_versions as ver
    where ver.entity_type_version_id = e.entity_type_version_id
    limit 1
  ) in ( ${selectSystemEntityTypeIds({ systemTypeName: "User" })} )
`;

// @todo: this function is not optimized to take DB indexes or sharding into account. It
//    might be better to have a separate "users" table.
export const getUserByEmail = async (
  conn: Connection,
  params: { email: string; verified?: boolean; primary?: boolean },
) => {
  const row = await conn.maybeOne<EntityPGRow>(sql`
    ${selectEntities}
    where
        ${matchesUserType}
      and
        exists (
          select *
          from json_array_elements(e.properties::json -> 'emails') email
          where ${sql.join(
            [
              sql`email ->> 'address' = ${params.email}`,
              params.verified !== undefined
                ? sql`(email ->> 'verified')::boolean = ${params.verified}`
                : [],
              params.primary !== undefined
                ? sql`(email ->> 'primary')::boolean = ${params.primary}`
                : [],
            ].flat(),
            sql` and `,
          )}
        )
  `);
  return row ? mapPGRowToEntity(row) : null;
};

// @todo: this function is not optimized to take DB indexes or sharding into account. It
//    might be better to have a separate "users" table.
export const getUserByShortname = async (
  conn: Connection,
  params: { shortname: string },
) => {
  const row = await conn.maybeOne<EntityPGRow>(sql`
    ${selectEntities}
    where
      e.properties ->> 'shortname' = ${params.shortname} and ${matchesUserType}
  `);
  return row ? mapPGRowToEntity(row) : null;
};
