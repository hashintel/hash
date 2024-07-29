import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { logProgress } from "../shared/log-progress.js";
import { getFileEntityFromUrl } from "./shared/get-file-entity-from-url.js";
import type { FlowActionActivity } from "./types.js";

export const getFileFromUrlAction: FlowActionActivity = async ({ inputs }) => {
  const {
    description,
    displayName,
    url: originalUrl,
  } = getSimplifiedActionInputs({
    inputs,
    actionType: "getFileFromUrl",
  });

  const getFileEntityFromUrlStatus = await getFileEntityFromUrl({
    entityUuid: null,
    url: originalUrl,
    description,
    displayName,
  });

  if (getFileEntityFromUrlStatus.status !== "ok") {
    return {
      code: StatusCode.Internal,
      message: getFileEntityFromUrlStatus.message,
      contents: [],
    };
  }

  // @todo look for an existing file with the same originalUrl in the graph, and update it if found?
  const operation = "create" as const;

  const fileEntity = getFileEntityFromUrlStatus.entity.toJSON();

  logProgress([
    {
      persistedEntity: {
        entity: fileEntity,
        operation, // @todo update this to "update" if an existing entity was found
      },
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
      type: "PersistedEntity",
    },
  ]);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "fileEntity" satisfies OutputNameForAction<"getFileFromUrl">,
            payload: {
              kind: "Entity",
              value: fileEntity,
            },
          },
        ],
      },
    ],
  };
};
