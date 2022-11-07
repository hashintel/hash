import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { NotFoundError } from "../lib/error";
import { logger } from "../logger";
import { HashInstanceModel } from "../model";
import { workspaceAccountId } from "../model/util";

/**
 * Ensures the required workspace knowledge has been created in the graph.
 */
export const ensureWorkspaceKnowledgeExists = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi } = params;
  logger.debug("Ensuring required Workspace knowledge exists");

  // Create workspace knowledge if they don't already exist
  /**
   * @todo Use transactional primitive/bulk insert to be able to do this in parallel
   *   see the following task:
   *   https://app.asana.com/0/1201095311341924/1202573572594586/f
   */

  await HashInstanceModel.getHashInstanceModel(graphApi).catch(
    async (error: Error) => {
      // Create the workspace instance entity, if it doesn't already exist.
      if (error instanceof NotFoundError) {
        return await HashInstanceModel.createHashInstance(graphApi, {
          actorId: workspaceAccountId,
        });
      }
      throw error;
    },
  );
};
