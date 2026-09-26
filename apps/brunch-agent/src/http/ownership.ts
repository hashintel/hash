/** Hono middleware for the mounted Flue conversation route. */
import { brunchHeaders } from "@hashintel/brunch-agent";

import { ownsFlueInstance } from "../conversation/identity.ts";

import type { MiddlewareHandler } from "hono";

export const agentOwnershipGuard =
  (mountPrefix: string, _agentName: string): MiddlewareHandler =>
  async (context, next) => {
    const principalKey = context.req.header(brunchHeaders.principal)?.trim();
    const conversationId = context.req
      .header(brunchHeaders.conversation)
      ?.trim();
    if (!principalKey || !conversationId)
      return context.json({ error: "unauthorized" }, 401);
    const instanceId = context.req.path
      .slice(mountPrefix.length)
      .split("/")
      .find((segment) => segment.length > 0);
    if (
      !instanceId ||
      !ownsFlueInstance({ principalKey, conversationId }, instanceId)
    )
      return context.json({ error: "forbidden" }, 403);
    if (
      context.req.method === "POST" &&
      context.req.path === `${mountPrefix}${instanceId}`
    ) {
      const body: unknown = await context.req.raw
        .clone()
        .json()
        .catch(() => undefined);
      if (typeof body === "object" && body !== null && "initialData" in body) {
        const data = body.initialData;
        if (
          typeof data === "object" &&
          data !== null &&
          "construction" in data
        ) {
          const construction = data.construction;
          if (
            typeof construction === "object" &&
            construction !== null &&
            "binding" in construction
          ) {
            const binding = construction.binding;
            if (
              typeof binding === "object" &&
              binding !== null &&
              "conversationId" in binding &&
              binding.conversationId !== conversationId
            )
              return context.json({ error: "forbidden" }, 403);
          }
        }
      }
    }
    await next();
  };
