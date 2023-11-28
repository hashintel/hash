import crypto from "node:crypto";

import { tupleIncludes } from "@local/advanced-types/includes";
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

  const linearIntegrations = await getAllLinearIntegrationsWithLinearOrgId(
    { graphApi },
    { actorId: systemAccountId },
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
          { actorId: systemAccountId },
          {
            linearIntegrationEntityId:
              linearIntegration.entity.metadata.recordId.entityId,
          },
        );

        await Promise.all(
          syncedWorkspaces.map(async (workspace) => {
            /** @todo: only sync with correct teams */

            const hashWorkspaceEntityId =
              workspace.workspaceEntity.metadata.recordId.entityId;

            const ownedById = extractEntityUuidFromEntityId(
              hashWorkspaceEntityId,
            ) as Uuid as OwnedById;

            const workflow =
              `${payloadAction}HashEntityFromLinearData` as const satisfies keyof WorkflowTypeMap;

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

            await temporalClient.workflow.start<
              WorkflowTypeMap[typeof workflow]
            >(workflow, {
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
            });
          }),
        );
      }),
    );
  }

  res.send("ok");
};
