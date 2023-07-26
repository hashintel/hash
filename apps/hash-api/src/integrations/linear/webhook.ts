import crypto from "node:crypto";

import { RequestHandler } from "express";

import { logger } from "../../logger";
import { createTemporalClient } from "../../temporal";
import { genId, getRequiredEnv } from "../../util";

type LinearWebhookPayloadBase = {
  action: string;
  createdAt: string; // ISO timestamp when the action took place.
  organizationId: string;
  type: "Cycle" | "Issue" | "Project" | "Reaction";
  url: string; // The URL of the subject entity.

  webhookId: string;
  webhookTimestamp: number; // UNIX timestamp of webhook delivery in milliseconds.
};

type LinearWebhookPayloadChange = LinearWebhookPayloadBase & {
  action: "create" | "update" | "delete";
  data: any; // The serialized value of the subject entity.
  updatedFrom?: any; // an object containing the previous values of updated properties;
};

type LinearWebhookPayload =
  | LinearWebhookPayloadBase
  | LinearWebhookPayloadChange;

// @todo upgrade to Express 5 which handles async controllers automatically
// eslint-disable-next-line @typescript-eslint/no-misused-promises
export const linearWebhook: RequestHandler<{}, "ok", string> = async (
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

  const temporalClient = await createTemporalClient(logger, {
    host: getRequiredEnv("HASH_TEMPORAL_SERVER_HOST"),
    port: parseInt(process.env.HASH_TEMPORAL_SERVER_PORT || "7233", 10),
    namespace: "HASH",
  });

  if (
    ["create", "update"].includes(payload.action) &&
    ["Issue", "User"].includes(payload.type)
  ) {
    const workflow = `${payload.action}${payload.type}`;
    await temporalClient.workflow.execute(workflow, {
      taskQueue: "integration",
      args: [
        {
          // @todo Use correct account IDs
          actorId: "00000000-0000-0000-0000-000000000000",
          ownedById: "00000000-0000-0000-0000-000000000000",
          issue: (payload as LinearWebhookPayloadChange).data,
        },
      ],
      workflowId: `${workflow}-${genId()}`,
    });
  }

  res.send("ok");
};
