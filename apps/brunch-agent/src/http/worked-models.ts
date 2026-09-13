import { Hono } from "hono";

import { parseWorkedModelNetProjectionDefinitionUpdate } from "@hashintel/brunch-agent-plugin-sdcpn/worked-model";
import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import type { WorkedModelStore } from "../worked-model-store.ts";

const bundleKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const principalFrom = (header: string | undefined): string | undefined => {
  const principalKey = header?.trim();
  return principalKey && principalKey.length > 0 ? principalKey : undefined;
};

export const createWorkedModelNetProjectionRouter = (
  store: WorkedModelStore,
): Hono => {
  const router = new Hono();

  router.get("/bundles/:bundleKey", async (context) => {
    const principalKey = principalFrom(
      context.req.header(BRUNCH_PRINCIPAL_HEADER),
    );
    if (principalKey === undefined)
      return context.json({ error: "unauthorized" }, 401);
    const bundleKey = context.req.param("bundleKey");
    if (!bundleKeyPattern.test(bundleKey))
      return context.json({ error: "invalid-bundle-key" }, 400);
    const netProjection = await store.resolveNetProjection({
      bundleKey,
      principalKey,
    });
    return netProjection === undefined
      ? context.json({ error: "bundle-not-found" }, 404)
      : context.json(netProjection);
  });

  // Compatibility path: "copies" currently creates only a fresh net projection.
  router.post("/bundles/:bundleKey/copies", async (context) => {
    const principalKey = principalFrom(
      context.req.header(BRUNCH_PRINCIPAL_HEADER),
    );
    if (principalKey === undefined)
      return context.json({ error: "unauthorized" }, 401);
    const bundleKey = context.req.param("bundleKey");
    if (!bundleKeyPattern.test(bundleKey))
      return context.json({ error: "invalid-bundle-key" }, 400);
    const netProjection = await store.createCleanNetProjection({
      bundleKey,
      principalKey,
    });
    return netProjection === undefined
      ? context.json({ error: "bundle-not-found" }, 404)
      : context.json(netProjection, 201);
  });

  // Compatibility path: "copies" currently updates only projection net state.
  router.put("/copies/:copyId/definition", async (context) => {
    const principalKey = principalFrom(
      context.req.header(BRUNCH_PRINCIPAL_HEADER),
    );
    if (principalKey === undefined)
      return context.json({ error: "unauthorized" }, 401);
    const body: unknown = await context.req.json().catch(() => undefined);
    let update;
    try {
      update = parseWorkedModelNetProjectionDefinitionUpdate(body);
    } catch {
      return context.json({ error: "invalid-definition-update" }, 400);
    }
    try {
      const netProjection = await store.updateNetProjectionDefinition({
        copyId: context.req.param("copyId"),
        principalKey,
        ...update,
      });
      return netProjection === undefined
        ? context.json({ error: "copy-not-found" }, 404)
        : context.json(netProjection);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "Worked-model net projection changed before this update."
      )
        return context.json({ error: "stale-copy" }, 409);
      throw error;
    }
  });

  return router;
};
