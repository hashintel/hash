import type { Logger } from "@local/hash-backend-utils/logger";

import type { ImpureGraphContext } from "./context-types";
import { migrateOntologyTypes } from "./ensure-system-graph-is-initialized/migrate-ontology-types";
import { ensureSystemEntitiesExist } from "./ensure-system-graph-is-initialized/system-webs-and-entities";
import { ensureHashSystemAccountExists } from "./system-account";

export const ensureSystemGraphIsInitialized = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  await ensureHashSystemAccountExists(params);

  await migrateOntologyTypes(params);

  await ensureSystemEntitiesExist(params);
};
