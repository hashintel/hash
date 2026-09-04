/** Hono middleware for the mounted Flue conversation route. */

import {
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
} from "@hashintel/brunch-agent-transport-aisdk/headers";

import { ownsFlueInstance } from "../conversation/identity.ts";

import type { MiddlewareHandler } from "hono";

export const agentOwnershipGuard = (mountPrefix: string): MiddlewareHandler => {
  return async (context, next) => {
    const principalKey = context.req.header(BRUNCH_PRINCIPAL_HEADER)?.trim();
    const conversationId = context.req
      .header(BRUNCH_CONVERSATION_HEADER)
      ?.trim();
    if (
      principalKey === undefined ||
      principalKey.length === 0 ||
      conversationId === undefined ||
      conversationId.length === 0
    ) {
      return context.json({ error: "unauthorized" }, 401);
    }
    const instanceId = context.req.path
      .slice(mountPrefix.length)
      .split("/")
      .find((segment) => segment.length > 0);
    if (
      instanceId === undefined ||
      !ownsFlueInstance({ principalKey, conversationId }, instanceId)
    ) {
      return context.json({ error: "forbidden" }, 403);
    }
    return next();
  };
};
