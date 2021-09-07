import { sql } from "slonik";

import { Connection } from "./types";
import { mapPGRowToEntity, selectEntities } from "./entity";
import { selectSystemEntityTypeIds } from "./entitytypes";

const matchesOrgType = sql`
  (
    select entity_type_id
    from entity_type_versions as ver
    where ver.entity_type_version_id = e.entity_type_version_id
    limit 1
  ) in ( ${selectSystemEntityTypeIds({ systemTypeName: "Org" })} )
`;

// @todo: this function is not optimized to take DB indexes or sharding into account. It
//    might be better to have a separate "orgs" table.
export const getOrgByShortname = async (
  conn: Connection,
  params: { shortname: string }
) => {
  const row = await conn.maybeOne(sql`
    ${selectEntities}
    where
      e.properties ->> 'shortname' = ${params.shortname} and ${matchesOrgType}
  `);
  return row ? mapPGRowToEntity(row) : null;
};
