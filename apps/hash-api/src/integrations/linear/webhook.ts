import crypto from "node:crypto";

import { tupleIncludes } from "@local/advanced-types/includes";
import { WorkflowTypeMap } from "@local/hash-backend-utils/temporal-workflow-types";
import { OwnedById } from "@local/hash-subgraph";
import { RequestHandler } from "express";

import { publicUserAccountId } from "../../auth/public-user-account-id";
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
    tupleIncludes(["Issue", "User"], payload.type)
  ) {
    if (!payload.data) {
      res
        .status(400)
        .send(
          `No data sent with ${payload.action} ${payload.type} webhook payload`,
        );
      return;
    }

    const workflow =
      `${payload.action}Hash${payload.type}` as const satisfies keyof WorkflowTypeMap;

    await temporalClient.workflow.start<WorkflowTypeMap[typeof workflow]>(
      workflow,
      {
        taskQueue: "integration",
        args: [
          {
            // @todo Use correct account IDs
            authentication: { actorId: publicUserAccountId },
            ownedById: publicUserAccountId as OwnedById,
            payload: payload.data,
          },
        ],
        workflowId: `${workflow}-${genId()}`,
      },
    );
  }

  res.send("ok");
};
