import crypto from "node:crypto";

import type { WebId } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { tupleIncludes } from "@local/advanced-types/includes";
import { timingSafeCompare } from "@local/hash-backend-utils/crypto";
import { getMachineIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import type { WorkflowTypeMap } from "@local/hash-backend-utils/temporal-integration-workflow-types";
import { supportedLinearTypes } from "@local/hash-backend-utils/temporal-integration-workflow-types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type { RequestHandler } from "express";

import type { ImpureGraphContext } from "../../graph/context-types";
import {
  getAllLinearIntegrationsWithLinearOrgId,
  getSyncedWebsForLinearIntegration,
} from "../../graph/knowledge/system-types/linear-integration-entity";
import { getLinearSecretValueByHashWebEntityId } from "../../graph/knowledge/system-types/linear-user-secret";
import { systemAccountId } from "../../graph/system-account";
import { logger } from "../../logger";

type LinearWebhookPayload = {
  action: "create" | "update" | "delete";
  createdAt: string; // ISO timestamp when the action took place.
  data?: { id: string }; // The serialized value of the subject entity.
  organizationId: string;
  type: "Cycle" | "Issue" | "Project" | "Reaction" | "User";
  url: string; // The URL of the subject entity.
  updatedFrom?: unknown; // an object containing the previous values of updated properties;
  webhookId: string;
  webhookTimestamp: number; // UNIX timestamp of webhook delivery in milliseconds.
};

export const linearWebhook: RequestHandler<
  Record<string, never>,
  string,
  string
> = async (req, res) => {
  const secret = process.env.LINEAR_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("LINEAR_WEBHOOK_SECRET is not set");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");

  const linearSignature = req.headers["linear-signature"];
  if (
    typeof linearSignature !== "string" ||
    !timingSafeCompare(expectedSignature, linearSignature)
  ) {
    res.sendStatus(400);
    return;
  }

  const payload = JSON.parse(req.body) as LinearWebhookPayload;

  const temporalClient = await createTemporalClient(logger);

  const organizationId = payload.organizationId;

  if (!payload.data) {
    res
      .status(400)
      .send(
        `No data sent with ${payload.action} ${payload.type} webhook payload`,
      );
    return;
  }

  const linearId = payload.data.id;

  if (!linearId) {
    res
      .status(400)
      .send(`No ID found in ${payload.action} ${payload.type} webhook payload`);
    return;
  }

  const { graphApi, vaultClient } = req.context;

  if (!vaultClient) {
    logger.error("No vault client found in Linear webhook");
    res.sendStatus(500);
    return;
  }

  const linearBotAccountId = await getMachineIdByIdentifier(
    req.context,
    { actorId: systemAccountId },
    { identifier: "linear" },
  ).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new Error("Failed to get linear bot account ID");
    }
    return maybeMachineId;
  });

  const graphContext: ImpureGraphContext = {
    graphApi,
    provenance: {
      actorType: "machine",
      origin: {
        id: "linear-webhook",
        type: "flow",
      },
    },
    temporalClient,
  };

  const linearIntegrations = await getAllLinearIntegrationsWithLinearOrgId(
    graphContext,
    { actorId: linearBotAccountId },
    { linearOrgId: organizationId },
  );

  if (
    tupleIncludes(["create", "update"], payload.action) &&
    tupleIncludes(supportedLinearTypes, payload.type)
  ) {
    const payloadAction = payload.action;
    const linearType = payload.type;

    await Promise.all(
      linearIntegrations.map(async (linearIntegration) => {
        const syncedWebs = await getSyncedWebsForLinearIntegration(
          graphContext,
          { actorId: linearBotAccountId },
          {
            linearIntegrationEntityId:
              linearIntegration.entity.metadata.recordId.entityId,
          },
        );

        await Promise.all(
          syncedWebs.map(async (web) => {
            /**
             * @todo sync items from specific teams rather than syncing all items
             *
             * @see https://linear.app/hash/issue/H-1467/in-the-linear-webhook-only-sync-items-from-specific-teams-rather-than
             */

            const hashWebEntityId = web.webEntity.metadata.recordId.entityId;

            const webId = extractEntityUuidFromEntityId(
              hashWebEntityId,
            ) as string as WebId;

            const workflow =
              `${payloadAction}HashEntityFromLinearData` as const satisfies keyof WorkflowTypeMap;

            const linearApiKey = await getLinearSecretValueByHashWebEntityId(
              graphContext,
              { actorId: linearBotAccountId },
              {
                hashWebEntityId,
                vaultClient,
              },
            );

            await temporalClient.workflow.start<
              WorkflowTypeMap[typeof workflow]
            >(workflow, {
              taskQueue: "integration",
              args: [
                {
                  authentication: { actorId: linearBotAccountId },
                  linearType,
                  linearId,
                  linearApiKey,
                  webId,
                },
              ],
              workflowId: `${workflow}-${generateUuid()}`,
            });
          }),
        );
      }),
    );
  }

  res.send("ok");
};
