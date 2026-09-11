import { Hono } from "hono";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";
import { parseSDCPNFile, type SDCPN } from "@hashintel/petrinaut-core";

import type { WorkedModelStore } from "../worked-model-store.ts";

const bundleKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;

const principalFrom = (header: string | undefined): string | undefined => {
  const principalKey = header?.trim();
  return principalKey && principalKey.length > 0 ? principalKey : undefined;
};

const definitionFrom = (value: unknown): SDCPN | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const parsed = parseSDCPNFile({
    ...value,
    title: "Worked-model copy",
  });
  if (!parsed.ok) return undefined;
  const { title: _title, ...definition } = parsed.sdcpn;
  return definition;
};

export const createWorkedModelRouter = (store: WorkedModelStore): Hono => {
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
    const copy = await store.resolveCopy({ bundleKey, principalKey });
    return copy === undefined
      ? context.json({ error: "bundle-not-found" }, 404)
      : context.json(copy);
  });

  router.post("/bundles/:bundleKey/copies", async (context) => {
    const principalKey = principalFrom(
      context.req.header(BRUNCH_PRINCIPAL_HEADER),
    );
    if (principalKey === undefined)
      return context.json({ error: "unauthorized" }, 401);
    const bundleKey = context.req.param("bundleKey");
    if (!bundleKeyPattern.test(bundleKey))
      return context.json({ error: "invalid-bundle-key" }, 400);
    const copy = await store.createCleanCopy({ bundleKey, principalKey });
    return copy === undefined
      ? context.json({ error: "bundle-not-found" }, 404)
      : context.json(copy, 201);
  });

  router.put("/copies/:copyId/definition", async (context) => {
    const principalKey = principalFrom(
      context.req.header(BRUNCH_PRINCIPAL_HEADER),
    );
    if (principalKey === undefined)
      return context.json({ error: "unauthorized" }, 401);
    const body: unknown = await context.req.json().catch(() => undefined);
    if (typeof body !== "object" || body === null || Array.isArray(body))
      return context.json({ error: "invalid-definition-update" }, 400);
    const expectedSha256 =
      "expectedSha256" in body && typeof body.expectedSha256 === "string"
        ? body.expectedSha256
        : undefined;
    const definition =
      "definition" in body ? definitionFrom(body.definition) : undefined;
    if (
      expectedSha256 === undefined ||
      !sha256Pattern.test(expectedSha256) ||
      definition === undefined
    )
      return context.json({ error: "invalid-definition-update" }, 400);
    try {
      const copy = await store.updateCopyDefinition({
        copyId: context.req.param("copyId"),
        principalKey,
        expectedSha256,
        definition,
      });
      return copy === undefined
        ? context.json({ error: "copy-not-found" }, 404)
        : context.json(copy);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Worked-model copy changed before this update."
      )
        return context.json({ error: "stale-copy" }, 409);
      throw error;
    }
  });

  return router;
};
