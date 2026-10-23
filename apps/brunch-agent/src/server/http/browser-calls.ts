import { Hono, type Context } from "hono";
import * as v from "valibot";

import {
  browserCallFailureBodySchema,
  browserCallLeaseBodySchema,
  browserCallResultBodySchema,
  brunchRoutes,
} from "@hashintel/brunch-agent";

import {
  claimBrowserCall,
  failBrowserCall,
  renewBrowserCall,
  settleBrowserCall,
} from "../../shared/conversation/browser-call-rendezvous.ts";

const callRoute = `/:id/${brunchRoutes.browserCalls}/:callId` as const;

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

  router.get(callRoute, (context) => {
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

  router.post(`${callRoute}/lease`, async (context) => {
    const body = await readBody(context, browserCallLeaseBodySchema);
    if (!body) return context.json({ error: "invalid-result" }, 400);
    const { id, callId } = context.req.param();
    return renewBrowserCall({ instanceId: id, toolCallId: callId, ...body })
      ? context.json({ renewed: true })
      : context.json({ error: "not-issued" }, 409);
  });

  router.post(callRoute, async (context) => {
    const body = await readBody(context, browserCallResultBodySchema);
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

  router.post(`${callRoute}/fail`, async (context) => {
    const body = await readBody(context, browserCallFailureBodySchema);
    if (!body) return context.json({ error: "invalid-result" }, 400);
    const { id, callId } = context.req.param();
    return failBrowserCall({ instanceId: id, toolCallId: callId, ...body })
      ? context.json({ failed: true })
      : context.json({ error: "not-issued" }, 409);
  });

  return router;
};
