/** Hono middleware for the mounted Flue conversation route. */
import { brunchHeaders } from "@hashintel/brunch-agent";

import { ownsFlueInstance } from "../../shared/conversation/identity.ts";

import type { Context, MiddlewareHandler } from "hono";

/**
 * The actor a request names: the actor header, else its former name. When
 * both arrive the actor header decides, even if they differ.
 * Temporary: read only `brunchHeaders.actor` once the Petrinaut website sends
 * it from its own server-side hop.
 */
const requestActorKey = (context: Context): string | undefined =>
  (
    context.req.header(brunchHeaders.actor) ??
    context.req.header(brunchHeaders.legacyPrincipal)
  )?.trim();

export const agentOwnershipGuard =
  (
    mountPrefix: string,
    _agentName: string,
    {
      sessionActor = false,
    }: {
      /**
       * Take the actor only from the session `hashSessionActor` resolved,
       * ignoring any actor header the request carries.
       */
      readonly sessionActor?: boolean;
    } = {},
  ): MiddlewareHandler =>
  async (context, next) => {
    const actorKey = sessionActor
      ? context.get("hashSessionActorKey")
      : requestActorKey(context);
    const conversationId = context.req
      .header(brunchHeaders.conversation)
      ?.trim();
    if (!actorKey || !conversationId)
      return context.json({ error: "unauthorized" }, 401);
    const instanceId = context.req.path
      .slice(mountPrefix.length)
      .split("/")
      .find((segment) => segment.length > 0);
    if (
      !instanceId ||
      !ownsFlueInstance({ actorKey, conversationId }, instanceId)
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
        if (typeof data === "object" && data !== null && "binding" in data) {
          const binding = data.binding;
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
    await next();
  };
