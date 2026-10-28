import { isEntityId } from "@blockprotocol/type-system";
import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import {
  FlowRunRecordNotFoundError,
  getStoredFlowRunRecordKey,
} from "@local/hash-backend-utils/flows/run-record";

import { getActorIdFromRequest } from "../auth/get-actor-id";

import type { ActorEntityUuid, EntityId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi } from "@local/hash-graph-client";
import type { Express } from "express";

const DOWNLOAD_URL_EXPIRATION_SECONDS = 60 * 5;

export type FlowRunRecordUrl =
  | { status: "found"; url: string }
  | { status: "notFound" }
  | { status: "running" };

/**
 * A short-lived URL to download the record a run stored when it ended, if the user can view the run.
 */
export const getFlowRunRecordUrl = async ({
  flowRunEntityId,
  graphApiClient,
  storageProvider,
  temporalClient,
  userAuthentication,
}: {
  flowRunEntityId: EntityId;
  graphApiClient: GraphApi;
  storageProvider: FileStorageProvider;
  temporalClient: TemporalClient;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<FlowRunRecordUrl> => {
  const flowRunEntity = await getFlowRunEntityById({
    flowRunEntityId,
    graphApiClient,
    userAuthentication,
  });

  if (!flowRunEntity) {
    return { status: "notFound" };
  }

  let key: string | null;

  try {
    key = await getStoredFlowRunRecordKey({
      storageProvider,
      temporalClient,
      workflowId:
        flowRunEntity.properties[
          "https://hash.ai/@h/types/property-type/workflow-id/"
        ],
    });
  } catch (error) {
    if (error instanceof FlowRunRecordNotFoundError) {
      return { status: "notFound" };
    }
    throw error;
  }

  if (!key) {
    return { status: "running" };
  }

  return {
    status: "found",
    url: await storageProvider.presignDownloadByKey({
      key,
      expiresInSeconds: DOWNLOAD_URL_EXPIRATION_SECONDS,
    }),
  };
};

/**
 * Mounts `GET /flow-runs/:flowRunEntityId/record`, which redirects to a short-lived URL for the record a run stored
 * when it ended: a header line, then one event per line. The file is fetched from storage directly, which streams it
 * and serves ranges, so it never passes through the API. `?urlOnly=true` returns the URL instead, for browser fetches
 * that can't follow a redirect to another origin.
 */
export const setupFlowRunRecordHandler = (app: Express) => {
  app.get("/flow-runs/:flowRunEntityId/record", async (req, res) => {
    const { flowRunEntityId } = req.params;

    if (!isEntityId(flowRunEntityId)) {
      res
        .status(400)
        .json({ error: `Invalid flow run entity id ${flowRunEntityId}` });
      return;
    }

    // The redirect below is to a URL presigned for the run's key in our own storage: the request only picks the run.
    // nosemgrep: ajinabraham.njsscan.redirect.open_redirect.express_open_redirect
    const recordUrl = await getFlowRunRecordUrl({
      flowRunEntityId,
      graphApiClient: req.context.graphApi,
      storageProvider: req.context.uploadProvider,
      temporalClient: req.context.temporalClient,
      userAuthentication: { actorId: getActorIdFromRequest(req) },
    });

    switch (recordUrl.status) {
      case "notFound":
        res.status(404).json({
          error: `Could not find a stored record for flow run ${flowRunEntityId}, either it does not exist or you do not have permission to view it.`,
        });
        return;
      case "running":
        res.status(409).json({
          error: `Flow run ${flowRunEntityId} is still running, so has no stored record yet. Read its events from FlowRun.events instead.`,
        });
        return;
      case "found":
        if (req.query.urlOnly) {
          res.json({ url: recordUrl.url });
          return;
        }
        res.redirect(recordUrl.url);
    }
  });
};
