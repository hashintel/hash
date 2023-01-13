import { Logger } from "@hashintel/hash-backend-utils/logger";

import { NotFoundError } from "../lib/error";
import { logger } from "../logger";
import { ImpureGraphContext } from "./index";
import {
  createHashInstance,
  getHashInstance,
} from "./knowledge/system-types/hash-instance";
import { systemUserAccountId } from "./system-user";

/**
 * Ensures the required system entities has been created in the graph.
 */
export const ensureSystemEntitiesExists = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { context } = params;
  logger.debug("Ensuring required system entities exists");

  // Create system entities if they don't already exist

  await getHashInstance(context, {}).catch(async (error: Error) => {
    // Create the system instance entity, if it doesn't already exist.
    if (error instanceof NotFoundError) {
      return await createHashInstance(context, {
        actorId: systemUserAccountId,
      });
    }
    throw error;
  });
};
