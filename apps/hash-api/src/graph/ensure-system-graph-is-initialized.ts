import type { Logger } from "@local/hash-backend-utils/logger";

import type { ImpureGraphContext } from "./context-types.js";
import { migrateOntologyTypes } from "./ensure-system-graph-is-initialized/migrate-ontology-types.js";
import { ensureSystemEntitiesExist } from "./ensure-system-graph-is-initialized/system-webs-and-entities.js";
import { ensureHashSystemAccountExists } from "./system-account.js";

export const ensureSystemGraphIsInitialized = async (params: {
  logger: Logger;
  context: ImpureGraphContext<false, true>;
}) => {
  await ensureHashSystemAccountExists(params);

  await migrateOntologyTypes(params);

  await ensureSystemEntitiesExist(params);
};
