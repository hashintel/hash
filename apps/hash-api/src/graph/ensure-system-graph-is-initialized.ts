import { Logger } from "@local/hash-backend-utils/logger";

import { ImpureGraphContext } from "./context-types";
import { ensureHashSystemAccountExists } from "./ensure-hash-system-account-exists";
import { ensureSystemEntitiesExist } from "./ensure-system-entities-exist";
import { migrateOntologyTypes } from "./migrate-ontology-types";
import { ensureAccountGroupOrgsExist } from "./util";

export const ensureSystemGraphIsInitialized = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  await ensureHashSystemAccountExists(params);

  await migrateOntologyTypes(params);

  await ensureAccountGroupOrgsExist(params);

  await ensureSystemEntitiesExist(params);
};
