import { getActorIdFromRequest } from "../../../auth/get-actor-id";

import type { ClusterEntitiesParams } from "@local/hash-graph-client";
import type { RequestHandler } from "express";

export const clusterEntitiesHandler: RequestHandler<
  Record<string, never>,
  | {
      clusters: {
        clusterId: number;
        entityIds: string[];
        centroid: number[];
      }[];
      missingEmbeddings: string[];
    }
  | { error: string },
  ClusterEntitiesParams
> = async (req, res) => {
  const actorId = getActorIdFromRequest(req);

  try {
    const { data } = await req.context.graphApi.clusterEntities(
      actorId,
      req.body,
    );

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
