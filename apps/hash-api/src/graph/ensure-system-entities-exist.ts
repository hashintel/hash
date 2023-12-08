import { Logger } from "@local/hash-backend-utils/logger";

import { NotFoundError } from "../lib/error";
import { logger } from "../logger";
import { ImpureGraphContext } from "./context-types";
import { systemAccountId } from "./ensusre-system-accounts-exist";
import {
  createHashInstance,
  getHashInstance,
} from "./knowledge/system-types/hash-instance";

/**
 * Ensures the required system entities has been created in the graph.
 */
export const ensureSystemEntitiesExist = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { context } = params;
  const authentication = { actorId: systemAccountId };
  logger.debug("Ensuring required system entities exists");

  // Create system entities if they don't already exist

  await getHashInstance(context, authentication, {}).catch(
    async (error: Error) => {
      // Create the system instance entity, if it doesn't already exist.
      if (error instanceof NotFoundError) {
        return await createHashInstance(context, authentication, {});
      }
      throw error;
    },
  );
};
