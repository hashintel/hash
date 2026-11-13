import { seedUnitGroups } from "./034-add-si-unit-data-types/seed-unit-groups";
import { commonUnitGroups } from "./035-add-common-unit-data-types/common-unit-groups";

import type { MigrationFunction } from "../types";

const migrate: MigrationFunction = (params) =>
  seedUnitGroups(params, commonUnitGroups);

export default migrate;
