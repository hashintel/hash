/**
 * The browser half of a waiting browser call over HTTP, after Brunch's
 * `apps/brunch-agent/src/server/http/browser-calls.ts`, under the owner's
 * claim rule. Mounted where the server serves a conversation's agent:
 *
 * - `POST <id>/browser-calls/<callId>` claims, with `vBrowserCallClaimBody`;
 * - `POST …/start` says the holder is executing it, with the lease body;
 * - `POST …/lease`, `…/result` and `…/fail` take the library's bodies.
 *
 * The caller's ownership middleware runs before these routes; the capability
 * proves the claim, not the user.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Harness,
  type JsonObject,
  ROOT_CONVERSATION_ID,
} from "@earendil-works/pi-durable";
import { type Context, Hono } from "hono";
import * as v from "valibot";

import {
  browserCallFailureBodySchema,
  browserCallLeaseBodySchema,
  browserCallResultBodySchema,
  brunchRoutes,
} from "@hashintel/brunch-agent";

import {
  claimBrowserCallAs,
  failBrowserCall,
  finishBrowserCall,
  renewBrowserCall,
  startBrowserCall,
} from "./browser-call";

/** A claim: the claiming tab's ID and its canonical editor binding. Not yet in `@hashintel/brunch-agent`. */
export const vBrowserCallClaimBody = v.object({
  claimant: v.pipe(v.string(), v.minLength(1)),
  binding: v.string(),
});

/** A start: the claim's proof, as the lease body carries it. */
export const vBrowserCallStartBody = browserCallLeaseBodySchema;

export type BrowserCallClaimBody = v.InferOutput<typeof vBrowserCallClaimBody>;
export type BrowserCallStartBody = v.InferOutput<typeof vBrowserCallStartBody>;

/** The open Harness serving a conversation, by the conversation ID in the route; `undefined` when none does. */
export type ResolveHarness = (
  conversationId: string,
) => Harness | undefined | Promise<Harness | undefined>;

const callRoute =
  `/:conversationId/${brunchRoutes.browserCalls}/:callId` as const;

const readBody = async <Schema extends v.GenericSchema>(
  context: Context,
  schema: Schema,
): Promise<v.InferOutput<Schema> | undefined> => {
  const body: unknown = await context.req.json().catch(() => undefined);
  const parsed = v.safeParse(schema, body);
  return parsed.success ? parsed.output : undefined;
};

const claimStatusCodes = {
  "not-issued": 404,
  "wrong-binding": 403,
  started: 409,
  ended: 409,
} as const;

/** The browser-call routes over the Harness `resolveHarness` names; calls live in its root conversation. */
export const createBrowserCallRouter = ({
  resolveHarness,
}: {
  readonly resolveHarness: ResolveHarness;
}): Hono => {
  const router = new Hono();
  const conversationId = ROOT_CONVERSATION_ID;
  const context = BACKGROUND_CONTEXT;

  /** The route's Harness and call ID, after its body parsed. */
  const addressed = async <Schema extends v.GenericSchema>(
    request: Context,
    schema: Schema,
  ) => {
    const body = await readBody(request, schema);
    if (body === undefined)
      return { response: request.json({ error: "invalid-body" }, 400) };
    const params = request.req.param();
    const harness = await resolveHarness(params.conversationId ?? "");
    if (harness === undefined)
      return {
        response: request.json({ error: "unknown-conversation" }, 404),
      };
    return { harness, body, toolCallId: params.callId ?? "" };
  };

  router.post(callRoute, async (request) => {
    request.header("Cache-Control", "no-store");
    const target = await addressed(request, vBrowserCallClaimBody);
    if ("response" in target) return target.response;
    const outcome = await claimBrowserCallAs(
      target.harness,
      conversationId,
      target.toolCallId,
      target.body,
      context,
    );
    return outcome.status === "claimed"
      ? request.json(outcome.claim)
      : request.json(
          { error: outcome.status },
          claimStatusCodes[outcome.status],
        );
  });

  router.post(`${callRoute}/start`, async (request) => {
    const target = await addressed(request, vBrowserCallStartBody);
    if ("response" in target) return target.response;
    return (await startBrowserCall(
      target.harness,
      conversationId,
      target.toolCallId,
      target.body,
      context,
    )) === "started"
      ? request.json({ started: true })
      : request.json({ error: "not-claimed" }, 409);
  });

  router.post(`${callRoute}/lease`, async (request) => {
    const target = await addressed(request, browserCallLeaseBodySchema);
    if ("response" in target) return target.response;
    return (await renewBrowserCall(
      target.harness,
      conversationId,
      target.toolCallId,
      target.body,
      context,
    ))
      ? request.json({ renewed: true })
      : request.json({ error: "not-issued" }, 409);
  });

  router.post(`${callRoute}/result`, async (request) => {
    const target = await addressed(request, browserCallResultBodySchema);
    if ("response" in target) return target.response;
    const { canonicalInput, ...body } = target.body;
    return (await finishBrowserCall(
      target.harness,
      {
        ...body,
        conversationId,
        toolCallId: target.toolCallId,
        canonicalInput: canonicalInput as JsonObject,
      },
      context,
    )) === "settled"
      ? request.json({ settled: true })
      : request.json({ error: "not-issued" }, 409);
  });

  router.post(`${callRoute}/fail`, async (request) => {
    const target = await addressed(request, browserCallFailureBodySchema);
    if ("response" in target) return target.response;
    const { canonicalInput, ...body } = target.body;
    return (await failBrowserCall(
      target.harness,
      {
        ...body,
        conversationId,
        toolCallId: target.toolCallId,
        canonicalInput: canonicalInput as JsonObject,
      },
      context,
    )) === "failed"
      ? request.json({ failed: true })
      : request.json({ error: "not-issued" }, 409);
  });

  return router;
};
