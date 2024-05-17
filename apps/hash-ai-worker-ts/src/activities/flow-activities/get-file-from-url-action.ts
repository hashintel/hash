import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { Entity } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { logProgress } from "../shared/log-progress";
import { getFileEntityFromUrl } from "./shared/get-file-entity-from-url";
import type { FlowActionActivity } from "./types";

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

  const { entityMetadata, properties } = getFileEntityFromUrlStatus;

  // @todo look for an existing file with the same originalUrl in the graph, and update it if found?
  const operation = "create" as const;

  logProgress([
    {
      persistedEntity: {
        entity: {
          metadata: entityMetadata,
          properties,
        } satisfies Entity,
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
              value: {
                metadata: entityMetadata,
                properties,
              } satisfies Entity,
            },
          },
        ],
      },
    ],
  };
};
