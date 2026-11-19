import { seedUnitGroups } from "./034-add-si-unit-data-types/seed-unit-groups";
import { siUnitGroups } from "./034-add-si-unit-data-types/si-unit-groups";

import type { MigrationFunction } from "../types";

const migrate: MigrationFunction = (params) =>
  seedUnitGroups(params, siUnitGroups);

export default migrate;
