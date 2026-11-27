import { seedUnitGroups } from "./034-add-si-unit-data-types/seed-unit-groups";
import { commonUnitGroups } from "./035-add-common-unit-data-types/common-unit-groups";
import { moveScrapPercentage } from "./035-add-common-unit-data-types/move-scrap-percentage";

import type { MigrationFunction } from "../types";

/**
 * Seeds the common units, which gives `Percentage` a version with conversions, and moves `Scrap Percentage` and the
 * types that use it onto that version.
 */
const migrate: MigrationFunction = async (params) => {
  const migrationState = await seedUnitGroups(params, commonUnitGroups);

  await moveScrapPercentage({ ...params, migrationState });

  return migrationState;
};

export default migrate;
