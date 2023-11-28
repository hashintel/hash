import crypto from "node:crypto";

import { tupleIncludes } from "@local/advanced-types/includes";
import {
  supportedLinearTypes,
  WorkflowTypeMap,
} from "@local/hash-backend-utils/temporal-workflow-types";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  extractOwnedByIdFromEntityId,
  Uuid,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { RequestHandler } from "express";

import { getEntities } from "../../graph/knowledge/primitive/entity";
import { getLinearSecretValueByHashWorkspaceId } from "../../graph/knowledge/system-types/linear-user-secret";
import { systemAccountId } from "../../graph/system-account";
import { logger } from "../../logger";
import { createTemporalClient } from "../../temporal";
import { genId } from "../../util";

type LinearWebhookPayload = {
  action: "create" | "update" | "delete";
  createdAt: string; // ISO timestamp when the action took place.
  data?: any; // The serialized value of the subject entity.
  organizationId: string;
  type: "Cycle" | "Issue" | "Project" | "Reaction" | "User";
  url: string; // The URL of the subject entity.
  updatedFrom?: any; // an object containing the previous values of updated properties;
  webhookId: string;
  webhookTimestamp: number; // UNIX timestamp of webhook delivery in milliseconds.
};

// @todo upgrade to Express 5 which handles async controllers automatically
// eslint-disable-next-line @typescript-eslint/no-misused-promises
export const linearWebhook: RequestHandler<{}, string, string> = async (
  req,
  res,
) => {
  const secret = process.env.LINEAR_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("LINEAR_WEBHOOK_SECRET is not set");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");

  if (expectedSignature !== req.headers["linear-signature"]) {
    res.sendStatus(400);
    return;
  }

  const payload = JSON.parse(req.body) as LinearWebhookPayload;

  const temporalClient = await createTemporalClient(logger);

  if (!temporalClient) {
    throw new Error(
      "Cannot create Temporal client – are there missing environment variables?",
    );
  }

  if (
    tupleIncludes(["create", "update"], payload.action) &&
    tupleIncludes(supportedLinearTypes, payload.type)
  ) {
    if (!payload.data) {
      res
        .status(400)
        .send(
          `No data sent with ${payload.action} ${payload.type} webhook payload`,
        );
      return;
    }

    const linearId = payload.data?.id;

    if (!linearId) {
      res
        .status(400)
        .send(
          `No ID found in ${payload.action} ${payload.type} webhook payload`,
        );
      return;
    }

    const { graphApi, vaultClient } = req.context;

    if (!vaultClient) {
      return;
    }

    const linearEntities = await getEntities(
      { graphApi },
      {
        actorId: systemAccountId,
      },
      {
        query: {
          filter: {
            all: [
              /** @todo: check for type */
              {
                equal: [
                  {
                    path: [
                      "properties",
                      linearPropertyTypes.id.propertyTypeBaseUrl,
                    ],
                  },
                  { parameter: linearId },
                ],
              },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          graphResolveDepths: zeroedGraphResolveDepths,
        },
      },
    ).then((subgraph) => getRoots(subgraph));

    const ownedByIds = linearEntities
      .map((entity) =>
        extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
      )
      .filter((item, index, all) => all.indexOf(item) === index);

    const workflow =
      `${payload.action}HashEntityFromLinearData` as const satisfies keyof WorkflowTypeMap;

    const linearType = payload.type;

    await Promise.all(
      ownedByIds.map(async (ownedById) => {
        /**
         * This assumes the web of the entity is an org web, not a user web.
         *
         * @todo: fix this so that it works for users and orgs
         */
        const hashWorkspaceEntityId = entityIdFromOwnedByIdAndEntityUuid(
          ownedById,
          ownedById as Uuid as EntityUuid,
        );

        const linearApiKey = await getLinearSecretValueByHashWorkspaceId(
          { graphApi },
          /**
           * We currently assign the integration permissions to the system account ID,
           * in the `syncLinearIntegrationWithWorkspaces` resolver, so we user the
           * `systemAccountId` here for now.
           */
          { actorId: systemAccountId },
          {
            hashWorkspaceEntityId,
            vaultClient,
          },
        );

        await temporalClient.workflow.start<WorkflowTypeMap[typeof workflow]>(
          workflow,
          {
            taskQueue: "integration",
            args: [
              {
                authentication: { actorId: systemAccountId },
                linearType,
                linearId,
                linearApiKey,
                ownedById,
              },
            ],
            workflowId: `${workflow}-${genId()}`,
          },
        );
      }),
    );
  }

  res.send("ok");
};
