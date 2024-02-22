import crypto from "node:crypto";

import { tupleIncludes } from "@local/advanced-types/includes";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import {
  supportedLinearTypes,
  WorkflowTypeMap,
} from "@local/hash-backend-utils/temporal-workflow-types";
import {
  extractEntityUuidFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";
import { RequestHandler } from "express";

import { ImpureGraphContext } from "../../graph/context-types";
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
  // @todo upgrade to Express 5 which handles async controllers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
> = async (req, res) => {
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
    return;
  }

  const linearBotAccountId = await getMachineActorId(
    req.context,
    { actorId: systemAccountId },
    { identifier: "linear" },
  );

  const graphContext: ImpureGraphContext = { graphApi, temporalClient };

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
        const syncedWorkspaces = await getSyncedWorkspacesForLinearIntegration(
          graphContext,
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
              graphContext,
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
