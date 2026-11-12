/**
 * The browser half of a waiting browser call over HTTP, after Brunch's
 * `apps/brunch-agent/src/server/http/browser-calls.ts`, under the owner's
 * claim rule. Mounted where the server serves a conversation's agent:
 *
 * - `POST <id>/browser-calls/<callId>` claims, with `vBrowserCallClaimBody`;
 *   a claim for a call not yet issued waits up to `issueWaitMs` for its issue
 *   commit before answering 404;
 * - `POST …/start` says the holder is executing it, with the lease body;
 * - `POST …/lease`, `…/result` and `…/fail` take the library's bodies;
 * - `GET <id>/browser-calls` reads every call's committed record, without its
 *   capability: what a panel replays after a reload;
 * - `POST <id>/browser-calls/hand-edits` admits a panel's hand-edit report,
 *   with `vHandEditReportBody`, as a stored note the model reads
 *   (`reportHandEdit`); a wrong binding is refused with 409. It answers with
 *   the note's submission and is never streamed.
 *
 * The caller's ownership middleware runs before these routes; the capability
 * proves the claim, not the user.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  type Harness,
  type JsonObject,
  ROOT_CONVERSATION_ID,
} from "@earendil-works/pi-durable";
import { type Context, Hono } from "hono";
import * as v from "valibot";

import {
  brunchRoutes,
  vBrowserCallFailureBody,
  vBrowserCallLeaseBody,
  vBrowserCallResultBody,
} from "@hashintel/brunch-agent";

import {
  type BrowserCallRecord,
  BrowserCallsDoc,
  claimBrowserCallAs,
  failBrowserCall,
  finishBrowserCall,
  renewBrowserCall,
  startBrowserCall,
} from "./browser-call";
import {
  handEditsRoute,
  reportHandEdit,
  vHandEditReportBody,
} from "./hand-edit";

/** A claim: the claiming tab's ID and its canonical editor binding. Not yet in `@hashintel/brunch-agent`. */
export const vBrowserCallClaimBody = v.object({
  claimant: v.pipe(v.string(), v.minLength(1)),
  binding: v.string(),
});

/** A start: the claim's proof, as the lease body carries it. */
export const vBrowserCallStartBody = vBrowserCallLeaseBody;

export type BrowserCallClaimBody = v.InferOutput<typeof vBrowserCallClaimBody>;
export type BrowserCallStartBody = v.InferOutput<typeof vBrowserCallStartBody>;

/** The open Harness serving a conversation, by the conversation ID in the route; `undefined` when none does. */
export type ResolveHarness = (
  conversationId: string,
) => Harness | undefined | Promise<Harness | undefined>;

const callRoute =
  `/:conversationId/${brunchRoutes.browserCalls}/:callId` as const;

const context = BACKGROUND_CONTEXT;

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

/**
 * How long a claim waits for its call's issue commit. AI SDK's stream shows a
 * tool call once its assistant entry commits, and the panel claims it then;
 * the tool task issues the call a scheduling step later, so a first claim
 * nearly always arrived before the record. Brunch's panel retries a 404 for
 * 6 s, so a wait inside that leaves it its retries for anything slower.
 */
export const defaultIssueWaitMs = 3_000;

/** How often a waiting claim looks for the record: a committed in-memory read. */
const issuePollMs = 20;

/** Wait until `toolCallId`'s record is committed, `deadline` passes or `signal` aborts. */
const waitForIssue = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  deadline: number,
  signal: AbortSignal,
) => {
  while (Date.now() < deadline && !signal.aborted) {
    // eslint-disable-next-line no-await-in-loop -- Each look follows the last one's wait.
    const issued = await harness.snapshot(
      BrowserCallsDoc,
      conversationId,
      context,
    );
    if (issued?.calls[toolCallId] !== undefined) return;
    // eslint-disable-next-line no-await-in-loop
    await sleep(issuePollMs);
  }
};

/** A call's committed record as a panel replays it: no capability, claimant or tasks. */
export type BrowserCallView = Pick<
  BrowserCallRecord,
  | "toolCallId"
  | "toolName"
  | "input"
  | "status"
  | "output"
  | "metadata"
  | "issuedEntry"
  | "callIndex"
>;

const viewOf = ({
  toolCallId,
  toolName,
  input,
  status,
  output,
  metadata,
  issuedEntry,
  callIndex,
}: BrowserCallRecord): BrowserCallView => ({
  toolCallId,
  toolName,
  input,
  status,
  output,
  metadata,
  ...(issuedEntry === undefined ? {} : { issuedEntry }),
  ...(callIndex === undefined ? {} : { callIndex }),
});

/** The browser-call routes over the Harness `resolveHarness` names; calls live in its root conversation. */
export const createBrowserCallRouter = ({
  resolveHarness,
  issueWaitMs = defaultIssueWaitMs,
}: {
  readonly resolveHarness: ResolveHarness;
  /** How long a claim for a call not yet issued waits for it; `defaultIssueWaitMs` when omitted. */
  readonly issueWaitMs?: number;
}): Hono => {
  const router = new Hono();
  const conversationId = ROOT_CONVERSATION_ID;

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

  router.get(
    `/:conversationId/${brunchRoutes.browserCalls}`,
    async (request) => {
      request.header("Cache-Control", "no-store");
      const harness = await resolveHarness(request.req.param("conversationId"));
      if (harness === undefined)
        return request.json({ error: "unknown-conversation" }, 404);
      const calls =
        (await harness.snapshot(BrowserCallsDoc, conversationId, context))
          ?.calls ?? {};
      return request.json({
        calls: Object.fromEntries(
          Object.entries(calls).map(([toolCallId, record]) => [
            toolCallId,
            viewOf(record),
          ]),
        ),
      });
    },
  );

  // Before the claim route, which would otherwise take `hand-edits` for a call ID.
  router.post(
    `/:conversationId/${brunchRoutes.browserCalls}/${handEditsRoute}`,
    async (request) => {
      request.header("Cache-Control", "no-store");
      const target = await addressed(request, vHandEditReportBody);
      if ("response" in target) return target.response;
      const outcome = await reportHandEdit(
        target.harness,
        conversationId,
        target.body,
        context,
      );
      if (outcome.status === "unknown-conversation")
        return request.json({ error: outcome.status }, 404);
      if (outcome.status === "wrong-binding")
        return request.json({ error: outcome.status }, 409);
      const { reportId, submission, placement } = outcome;
      return request.json({ reportId, submission, placement });
    },
  );

  router.post(callRoute, async (request) => {
    request.header("Cache-Control", "no-store");
    const target = await addressed(request, vBrowserCallClaimBody);
    if ("response" in target) return target.response;
    const claim = () =>
      claimBrowserCallAs(
        target.harness,
        conversationId,
        target.toolCallId,
        target.body,
        context,
      );
    let outcome = await claim();
    if (outcome.status === "not-issued" && issueWaitMs > 0) {
      await waitForIssue(
        target.harness,
        conversationId,
        target.toolCallId,
        Date.now() + issueWaitMs,
        request.req.raw.signal,
      );
      outcome = await claim();
    }
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
    const target = await addressed(request, vBrowserCallLeaseBody);
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
    const target = await addressed(request, vBrowserCallResultBody);
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
    const target = await addressed(request, vBrowserCallFailureBody);
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
