import crypto from "node:crypto";

import { RequestHandler } from "express";

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

  const _payload = JSON.parse(req.body) as LinearWebhookPayload;

  // @todo trigger update to HASH entities based on the payload

  res.send("ok");
};
