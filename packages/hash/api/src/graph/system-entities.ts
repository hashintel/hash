import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { NotFoundError } from "../lib/error";
import { logger } from "../logger";
import { HashInstanceModel } from "../model";
import { systemUserAccountId } from "./system-user";

/**
 * Ensures the required system entities has been created in the graph.
 */
export const ensureSystemEntitiesExists = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi } = params;
  logger.debug("Ensuring required system entities exists");

  // Create system entities if they don't already exist

  await HashInstanceModel.getHashInstanceModel(graphApi).catch(
    async (error: Error) => {
      // Create the system instance entity, if it doesn't already exist.
      if (error instanceof NotFoundError) {
        return await HashInstanceModel.createHashInstance(graphApi, {
          actorId: systemUserAccountId,
        });
      }
      throw error;
    },
  );
};
