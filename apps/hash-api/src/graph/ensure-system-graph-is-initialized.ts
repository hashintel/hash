import { Logger } from "@local/hash-backend-utils/logger";

import { ImpureGraphContext } from "./context-types";
import { migrateOntologyTypes } from "./migrate-ontology-types";
import { ensureSystemAccountExists } from "./system-account";
import { ensureSystemEntitiesExists } from "./system-entities";
import { ensureAccountGroupOrgsExist } from "./util";

export const ensureSystemGraphIsInitialized = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  await ensureSystemAccountExists(params);

  await migrateOntologyTypes(params);

  await ensureAccountGroupOrgsExist(params);

  await ensureSystemEntitiesExists(params);
};
