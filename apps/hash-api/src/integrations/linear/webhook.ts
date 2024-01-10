import crypto from "node:crypto";

import { tupleIncludes } from "@local/advanced-types/includes";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import {
  supportedLinearTypes,
  WorkflowTypeMap,
} from "@local/hash-backend-utils/temporal-workflow-types";
import type { OwnedById, Uuid } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import type { RequestHandler } from "express";

import {
  getAllLinearIntegrationsWithLinearOrgId,
  getSyncedWorkspacesForLinearIntegration,
} from "../../graph/knowledge/system-types/linear-integration-entity";
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

  const organizationId = payload.organizationId;

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
      .send(`No ID found in ${payload.action} ${payload.type} webhook payload`);
    return;
  }

  const { graphApi, vaultClient } = req.context;

  if (!vaultClient) {
    return;
  }

  const linearBotAccountId = await getMachineActorId(
    req.context,
    { actorId: systemAccountId },
    { identifier: "linear" },
  );

  const linearIntegrations = await getAllLinearIntegrationsWithLinearOrgId(
    { graphApi },
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
        const syncedWorkspaces = await getSyncedWorkspacesForLinearIntegration(
          { graphApi },
          { actorId: linearBotAccountId },
          {
            linearIntegrationEntityId:
              linearIntegration.entity.metadata.recordId.entityId,
          },
        );

        await Promise.all(
          syncedWorkspaces.map(async (workspace) => {
            /**
             * @todo sync items from specific teams rather than syncing all items
             *
             * @see https://linear.app/hash/issue/H-1467/in-the-linear-webhook-only-sync-items-from-specific-teams-rather-than
             */

            const hashWorkspaceEntityId =
              workspace.workspaceEntity.metadata.recordId.entityId;

            const ownedById = extractEntityUuidFromEntityId(
              hashWorkspaceEntityId,
            ) as Uuid as OwnedById;

            const workflow =
              `${payloadAction}HashEntityFromLinearData` as const satisfies keyof WorkflowTypeMap;

            const linearApiKey = await getLinearSecretValueByHashWorkspaceId(
              { graphApi },
              { actorId: linearBotAccountId },
              {
                hashWorkspaceEntityId,
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
                  ownedById,
                },
              ],
              workflowId: `${workflow}-${genId()}`,
            });
          }),
        );
      }),
    );
  }

  res.send("ok");
};
