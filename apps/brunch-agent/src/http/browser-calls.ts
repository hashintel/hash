import { Hono, type Context } from "hono";
import * as v from "valibot";

import {
  claimBrowserCall,
  failBrowserCall,
  renewBrowserCall,
  settleBrowserCall,
} from "../conversation/browser-call-rendezvous.ts";

const leaseBody = v.object({ capability: v.string(), binding: v.string() });
const outcomeEntries = {
  ...leaseBody.entries,
  toolName: v.string(),
  canonicalInput: v.unknown(),
};
const resultBody = v.object({
  ...outcomeEntries,
  output: v.unknown(),
  metadata: v.optional(v.unknown()),
});
const failureBody = v.object({
  ...outcomeEntries,
  disposition: v.picklist(["unstarted", "failed"]),
});

const readBody = async <Schema extends v.GenericSchema>(
  context: Context,
  schema: Schema,
): Promise<v.InferOutput<Schema> | undefined> => {
  const body: unknown = await context.req.json().catch(() => undefined);
  const parsed = v.safeParse(schema, body);
  return parsed.success ? parsed.output : undefined;
};

/** The browser half of an issued client-tool call: claim, lease renewal, result, failure. */
export const createBrowserCallRouter = (): Hono => {
  const router = new Hono();

  router.get("/:id/browser-calls/:callId", (context) => {
    context.header("Cache-Control", "no-store");
    const binding = context.req.query("binding");
    if (binding === undefined)
      return context.json({ error: "invalid-binding" }, 400);
    const { id, callId } = context.req.param();
    const issued = claimBrowserCall(id, callId, binding);
    return issued
      ? context.json(issued)
      : context.json({ error: "not-issued" }, 404);
  });

  router.post("/:id/browser-calls/:callId/lease", async (context) => {
    const body = await readBody(context, leaseBody);
    if (!body) return context.json({ error: "invalid-result" }, 400);
    const { id, callId } = context.req.param();
    return renewBrowserCall({ instanceId: id, toolCallId: callId, ...body })
      ? context.json({ renewed: true })
      : context.json({ error: "not-issued" }, 409);
  });

  router.post("/:id/browser-calls/:callId", async (context) => {
    const body = await readBody(context, resultBody);
    if (!body) return context.json({ error: "invalid-result" }, 400);
    const { id, callId } = context.req.param();
    return settleBrowserCall({
      instanceId: id,
      toolCallId: callId,
      ...body,
    }) === "settled"
      ? context.json({ settled: true })
      : context.json({ error: "not-issued" }, 409);
  });

  router.post("/:id/browser-calls/:callId/fail", async (context) => {
    const body = await readBody(context, failureBody);
    if (!body) return context.json({ error: "invalid-result" }, 400);
    const { id, callId } = context.req.param();
    return failBrowserCall({ instanceId: id, toolCallId: callId, ...body })
      ? context.json({ failed: true })
      : context.json({ error: "not-issued" }, 409);
  });

  return router;
};
