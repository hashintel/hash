/**
 * Ownership middleware on the mounted Flue route, isolated from the Flue
 * runtime: missing identity is 401, a hash mismatch is 403, a matching pair
 * is admitted.
 */

import { Hono } from "hono";
import { expect, test, vi } from "vitest";

import { batchedConstructionMode } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { BRUNCH_DOCUMENT_REVISION_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import {
  agentOwnershipHeaders,
  BRUNCH_CONVERSATION_HEADER,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import {
  reportedRevisionSubmissionId,
  takeReportedDocumentRevision,
  withReportedDocumentRevisionScope,
} from "../src/conversation/reported-document-revision.ts";
import { agentOwnershipGuard } from "../src/http/ownership.ts";
import { CHAT_AGENT_ROUTE } from "../src/http/routes.ts";
import { diagnostics } from "../src/runtime-diagnostics.ts";

const mount = `/agents/${CHAT_AGENT_ROUTE}`;
const agentName = "test-agent";
const app = new Hono();
app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`, agentName));
app.post(`${mount}/:id/abort`, (context) => context.json({ aborted: true }));
app.all(`${mount}/*`, async (context) => {
  if (context.req.method !== "POST") return context.text("admitted");
  const body: unknown = await context.req.json();
  if (
    typeof body === "object" &&
    body !== null &&
    "throw" in body &&
    body.throw === true
  )
    throw new Error("Admission failed.");
  if (
    typeof body === "object" &&
    body !== null &&
    "reject" in body &&
    body.reject === true
  )
    return context.json({ error: "rejected" }, 409);
  if (
    typeof body !== "object" ||
    body === null ||
    !("idempotencyKey" in body) ||
    typeof body.idempotencyKey !== "string"
  )
    return context.json({ error: "missing-idempotency-key" }, 400);
  if (
    "consumeDuringAdmission" in body &&
    body.consumeDuringAdmission === true
  ) {
    const requestInstanceId = context.req.path.split("/").at(-1);
    if (!requestInstanceId)
      return context.json({ error: "missing-instance-id" }, 400);
    const submissionId = reportedRevisionSubmissionId(
      agentName,
      requestInstanceId,
      body.idempotencyKey,
    );
    const revisionId = await withReportedDocumentRevisionScope(
      submissionId,
      async () => takeReportedDocumentRevision(),
    );
    return context.json({ submissionId, revisionId }, 202);
  }
  return context.json({ submissionId: body.idempotencyKey }, 202);
});

const identity = {
  principalKey: "principal-a",
  conversationId: "conversation-1",
};
const instanceId = flueConversationIdFrom(identity);
const conversationUrl = `http://brunch.test${mount}/${instanceId}`;
const submissionIdFor = (idempotencyKey: string) =>
  reportedRevisionSubmissionId(agentName, instanceId, idempotencyKey);

test("bodyless Stop retains ownership checks without admission-body diagnostics", async () => {
  const report = vi.spyOn(diagnostics, "report");
  try {
    const response = await app.fetch(
      new Request(`${conversationUrl}/abort`, {
        method: "POST",
        headers: agentOwnershipHeaders(identity),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ aborted: true });
    expect(report).not.toHaveBeenCalled();
    const forbidden = await app.fetch(
      new Request(`${conversationUrl}/abort`, {
        method: "POST",
        headers: agentOwnershipHeaders({ ...identity, principalKey: "other" }),
      }),
    );
    expect(forbidden.status).toBe(403);
  } finally {
    report.mockRestore();
  }
});

test("the mounted agent route rejects a request with no ownership headers", async () => {
  const response = await app.fetch(new Request(conversationUrl));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("the mounted agent route rejects a principal that does not re-derive the id", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      headers: agentOwnershipHeaders({
        principalKey: "principal-other",
        conversationId: identity.conversationId,
      }),
    }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "forbidden" });
});

test("the mounted agent route admits a principal and conversation that hash to the id", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      headers: agentOwnershipHeaders(identity),
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("admitted");
});

test("refuses a joined initial binding for another authenticated conversation", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      method: "POST",
      headers: {
        ...agentOwnershipHeaders(identity),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        initialData: {
          mode: batchedConstructionMode,
          browser: {
            binding: {
              conversationId: "another",
              documentId: "document",
              incarnationId: "incarnation",
            },
            requestedBaseHash: "a".repeat(64),
          },
        },
        kind: "user",
        body: "test",
      }),
    }),
  );
  expect(response.status).toBe(403);
});

test("a blank conversation header is unauthorized, not a hash mismatch", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      headers: {
        ...agentOwnershipHeaders(identity),
        [BRUNCH_CONVERSATION_HEADER]: "  ",
      },
    }),
  );
  expect(response.status).toBe(401);
});

test("retains the authorized browser revision reported with an admission", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      method: "POST",
      headers: {
        ...agentOwnershipHeaders(identity),
        [BRUNCH_DOCUMENT_REVISION_HEADER]: "browser-revision-2",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "user",
        body: "test",
        idempotencyKey: "submission-revision-2",
      }),
    }),
  );

  expect(response.status).toBe(202);
  await withReportedDocumentRevisionScope(
    submissionIdFor("submission-revision-2"),
    async () => {
      expect(takeReportedDocumentRevision()).toBe("browser-revision-2");
      expect(takeReportedDocumentRevision()).toBeUndefined();
    },
  );
});

test("correlates concurrent browser revisions by admitted submission", async () => {
  const request = (submissionId: string, revisionId: string) =>
    app.fetch(
      new Request(conversationUrl, {
        method: "POST",
        headers: {
          ...agentOwnershipHeaders(identity),
          [BRUNCH_DOCUMENT_REVISION_HEADER]: revisionId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "user",
          body: `test ${submissionId}`,
          idempotencyKey: submissionId,
        }),
      }),
    );

  const [first, second] = await Promise.all([
    request("submission-first", "browser-revision-first"),
    request("submission-second", "browser-revision-second"),
  ]);
  expect(first.status).toBe(202);
  expect(second.status).toBe(202);

  await withReportedDocumentRevisionScope(
    submissionIdFor("submission-second"),
    async () => {
      expect(takeReportedDocumentRevision()).toBe("browser-revision-second");
    },
  );
  await withReportedDocumentRevisionScope(
    submissionIdFor("submission-first"),
    async () => {
      expect(takeReportedDocumentRevision()).toBe("browser-revision-first");
    },
  );
});

test("makes the correlated revision available while admission is running", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      method: "POST",
      headers: {
        ...agentOwnershipHeaders(identity),
        [BRUNCH_DOCUMENT_REVISION_HEADER]: "browser-revision-during-admission",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "user",
        body: "test",
        idempotencyKey: "submission-during-admission",
        consumeDuringAdmission: true,
      }),
    }),
  );

  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    revisionId: "browser-revision-during-admission",
  });
});

test("does not retain a browser revision when downstream admission rejects", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      method: "POST",
      headers: {
        ...agentOwnershipHeaders(identity),
        [BRUNCH_DOCUMENT_REVISION_HEADER]: "rejected-browser-revision",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "user",
        body: "test",
        idempotencyKey: "submission-rejected",
        reject: true,
      }),
    }),
  );

  expect(response.status).toBe(409);
  await withReportedDocumentRevisionScope(
    submissionIdFor("submission-rejected"),
    async () => {
      expect(takeReportedDocumentRevision()).toBeUndefined();
    },
  );
});

test("does not retain a browser revision when downstream admission throws", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      method: "POST",
      headers: {
        ...agentOwnershipHeaders(identity),
        [BRUNCH_DOCUMENT_REVISION_HEADER]: "thrown-browser-revision",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "user",
        body: "test",
        idempotencyKey: "submission-thrown",
        throw: true,
      }),
    }),
  );

  expect(response.status).toBe(500);
  await withReportedDocumentRevisionScope(
    submissionIdFor("submission-thrown"),
    async () => {
      expect(takeReportedDocumentRevision()).toBeUndefined();
    },
  );
});
