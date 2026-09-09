/** Synthetic plumbing only: existing persona tool → mounted ChatAgent → actual Chrome pane → UI continuation. */
/* eslint-disable no-await-in-loop -- Turn settlement, visible observation and correction are causally serial. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxProvider,
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient, type AgentSendResult } from "@flue/sdk";
import { expect } from "@playwright/test";

import brunchPersonaTestingExtension from "../.pi/extensions/brunch-persona-testing.ts";
import {
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
  agentOwnershipHeaders,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { browserSessionOptions } from "../src/evaluations/persona/browser-session.ts";
import {
  createBrunchTurnTool,
  type BrunchTurnTool,
} from "../src/evaluations/persona/brunch-turn.ts";
import { assertExternalDenied } from "../src/evaluations/real-provider-a5/network-guard.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";

await assertExternalDenied();
const output = mkdtempSync(join(tmpdir(), "m7-persona-browser-"));
const save = (name: string, value: unknown) =>
  writeFileSync(join(output, `${name}.json`), JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  assert.equal(
    new URL(input instanceof Request ? input.url : String(input)).hostname,
    "127.0.0.1",
  );
  return originalFetch(input, init);
};
const captures: NativeRequestCapture[] = [];
let app: Awaited<ReturnType<typeof loadBuiltBrunchApplication>> | undefined;
let fixture: Awaited<ReturnType<typeof openBrowserFixture>> | undefined;
try {
  const faux = fauxProvider({
    provider: "anthropic",
    models: [{ id: "claude-sonnet-4-6", reasoning: true }],
  });
  const contexts: Context[] = [];
  installFauxProvider(nativeSchemaProvider(faux.provider, captures, contexts));
  app = await loadBuiltBrunchApplication();
  fixture = await openBrowserFixture(
    app,
    resolve(process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist"),
  );
  const { page, origin, deliveries, errors, blocked } = fixture;
  const text = (body: string) => fauxAssistantMessage([fauxText(body)]);
  const call = (name: string, args: Record<string, unknown>, id: string) =>
    fauxAssistantMessage([fauxToolCall(name, args, { id })], {
      stopReason: "toolUse",
    });
  const toolOutput = (
    context: Context,
    name: string,
  ): Record<string, unknown> => {
    const result = context.messages.findLast(
      (message) => message.role === "toolResult" && message.toolName === name,
    );
    assert(result?.role === "toolResult" && !result.isError);
    return JSON.parse(
      result.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(""),
    ) as Record<string, unknown>;
  };
  let checked = 0;
  const evidence: {
    revisionId: string;
    sourceIds: string[];
    markdown: string;
  }[] = [];
  const revisionResponses = (
    utterance: string,
    markdown: string,
    passage: string,
    revisionId: string,
  ) => [
    call(
      "brunch_workpiece",
      { markdown, locateTexts: [passage] },
      `${revisionId}-sources`,
    ),
    (context: Context) => {
      const result = toolOutput(context, "brunch_workpiece");
      const source = (result.sources as { id: string; text: string }[]).find(
        (entry) => entry.text === utterance,
      );
      assert(
        source,
        "Source must come from the actual model-facing query, not fabricated history",
      );
      const locator = (
        result.locatorLookup as {
          queries: { occurrences: { start: number; end: number }[] }[];
        }
      ).queries[0]?.occurrences[0];
      assert(locator);
      checked++;
      evidence.push({ revisionId, sourceIds: [source.id], markdown });
      return call(
        "update_workpiece",
        {
          markdown,
          evidence: [{ locator, messageIds: [source.id], kind: "elicited" }],
        },
        revisionId,
      );
    },
    call("brunch_workpiece", {}, `${revisionId}-read`),
    (context: Context) => {
      const current = toolOutput(context, "brunch_workpiece")
        .currentWorkpiece as {
        revisionId: string;
        markdown: string;
        evidence: { messageIds: string[] }[];
      };
      assert.equal(current.revisionId, revisionId);
      assert.equal(current.markdown, markdown);
      assert.deepEqual(
        current.evidence[0]?.messageIds,
        evidence.at(-1)?.sourceIds,
      );
      checked++;
      return text(
        `TEST synthetic reply ${revisionId}. What else should I know?`,
      );
    },
  ];
  const uiSend = async (body: string, done: string) => {
    const composer = page.getByRole("textbox", {
      name: "Message AI assistant",
      exact: true,
    });
    await composer.fill(body);
    await composer.press("Enter");
    await expect(page.getByText(done, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  };
  await page.goto(`${origin}/?brunchTracer=root-creation`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  faux.setResponses([text("TEST ready for your account.")]);
  // The same data an operator obtains from Chrome Network: allowlisted request
  // fields and the returned admission UID, not a HAR/cookies/auth headers.
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/agents/chat/"),
  );
  await uiSend(
    "Hello, I would like to describe our process.",
    "TEST ready for your account.",
  );
  const response = await responsePromise;
  assert.equal(response.status(), 202);
  const request = response.request();
  const headers = await request.allHeaders();
  const admission = (await response.json()) as AgentSendResult;
  assert(admission.uid);
  const requestBody = request.postDataJSON() as { initialData: unknown };
  const config = {
    url: request.url(),
    principalKey: headers[BRUNCH_PRINCIPAL_HEADER],
    conversationId: headers[BRUNCH_CONVERSATION_HEADER],
    initialData: requestBody.initialData,
    uid: admission.uid,
  };
  assert(config.principalKey && config.conversationId);
  save("operator-session", config);
  const client = createFlueClient({
    url: config.url,
    headers: agentOwnershipHeaders({
      principalKey: config.principalKey,
      conversationId: config.conversationId,
    }),
  });
  const initialHistory = await client.history();
  save("initial-history", initialHistory);
  assert.equal(
    initialHistory.messages.filter((message) => message.purpose === "user")
      .length,
    1,
  );
  let persona: BrunchTurnTool | undefined;
  const hooks: (() => void | Promise<void>)[] = [];
  await brunchPersonaTestingExtension({
    registerProvider: () => {
      throw new Error(
        "Synthetic browser join must not register a live provider",
      );
    },
    registerFlag: () => {},
    getFlag: (name) =>
      name === "brunch-browser-session"
        ? join(output, "operator-session.json")
        : undefined,
    registerTool: (tool) => {
      persona = tool;
    },
    on: (event, handler) => {
      if (event === "session_start")
        hooks.push(() =>
          handler(undefined, {
            model: undefined,
            sessionManager: { getSessionId: () => "TEST-browser-join" },
            modelRegistry: { getProviderAuth: async () => undefined },
          }),
        );
    },
  });
  for (const hook of hooks) await hook();
  assert(persona);
  const first =
    "TEST simulated testimony: one operator handles each item. Timing is unknown.";
  const second =
    "TEST simulated correction: two operators are needed for each item, not one. Timing is still unknown.";
  const markdowns = [
    "# TEST simulated account\n\nOne operator handles each item.\n\nTiming is unknown.",
    "# TEST simulated account\n\nTwo operators are needed for each item, not one.\n\nTiming is unknown.",
  ];
  for (const [index, utterance] of [first, second].entries()) {
    const markdown = markdowns[index];
    assert(markdown);
    const revisionId = `persona-revision-${index + 1}`;
    const passage = markdown.split("\n\n")[1];
    assert(passage);
    faux.setResponses(
      revisionResponses(utterance, markdown, passage, revisionId),
    );
    const result = await persona.execute(
      `TEST-persona-${index}`,
      { message: utterance },
      AbortSignal.timeout(30_000),
    );
    assert.equal(result.details.status, "elicitor-replied");
    assert(!JSON.stringify(result.content).includes(config.principalKey));
    await expect(page.getByText(utterance, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(
        `TEST synthetic reply ${revisionId}. What else should I know?`,
        { exact: true },
      ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("brunch-current-workpiece")).toHaveText(
      markdown,
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("region", { name: "Brunch workpiece and why" }),
    ).toContainText(revisionId);
    const history = await client.history();
    const relation = evidence[index];
    assert(relation);
    assert(
      history.messages.some(
        (message) =>
          message.role === "user" &&
          message.purpose === "user" &&
          message.id === relation.sourceIds[0] &&
          message.parts.some(
            (part) => part.type === "text" && part.text === utterance,
          ),
      ),
    );
    save(`revision-${index + 1}`, history);
    await page.screenshot({
      path: join(output, `revision-${index + 1}.png`),
      fullPage: true,
    });
  }
  assert.equal(
    checked,
    4,
    "All provider-side source and settlement assertions must run",
  );
  const beforeNegative = (await client.history()).messages.length;
  await assert.rejects(
    browserSessionOptions({ ...config, conversationId: "wrong-conversation" }),
    /ownership mismatch/u,
  );
  const wrongBinding = structuredClone(config);
  assert(
    typeof wrongBinding.initialData === "object" &&
      wrongBinding.initialData !== null,
  );
  const data = wrongBinding.initialData as {
    construction: { binding: { incarnationId: string } };
  };
  data.construction.binding.incarnationId = "wrong-document-incarnation";
  await assert.rejects(
    browserSessionOptions(wrongBinding),
    /binding missing or mismatched/u,
  );
  const attached = await browserSessionOptions(config);
  const stale = createBrunchTurnTool({
    ...attached,
    uid: "wrong-runtime-incarnation",
  });
  await assert.rejects(
    stale.execute("stale", { message: "Must not be delivered" }),
    /not found|not_found/iu,
  );
  assert.equal((await client.history()).messages.length, beforeNegative);
  // Stop persona driving; reopen the same browser profile/document and continue
  // through the ordinary composer. No seeded workpiece, direct state write or new ID.
  await page.reload();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await expect(page.getByTestId("brunch-current-workpiece")).toHaveText(
    markdowns[1]!,
    { timeout: 30_000 },
  );
  const continuation =
    "TEST UI continuation: timing remains unknown; keep that qualification.";
  faux.setResponses([
    call("brunch_workpiece", {}, "ui-continuation-read"),
    text("TEST continued the same account; timing remains unknown."),
  ]);
  await uiSend(
    continuation,
    "TEST continued the same account; timing remains unknown.",
  );
  await expect(
    page.getByRole("region", { name: "Brunch workpiece and why" }),
  ).toContainText("ui-continuation-read", { timeout: 30_000 });
  const final = await client.history();
  assert.equal(final.conversationId, initialHistory.conversationId);
  assert.equal(
    final.messages.filter((message) => message.purpose === "user").length,
    4,
  );
  const sends = deliveries
    .map(
      (delivery) =>
        JSON.parse(delivery.body) as {
          kind: string;
          uid?: string;
          initialData?: unknown;
        },
    )
    .filter((body) => body.kind === "user");
  assert(sends.length >= 4);
  for (const send of sends.slice(1, 3)) {
    assert.equal(send.uid, admission.uid);
    assert(!("initialData" in send));
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  save("final-history", final);
  save("evidence-links", evidence);
  save("summary", {
    label: "Synthetic plumbing only; no persona/semantic/PM acceptance",
    checked,
    requests: contexts.length,
    revisions: 2,
    canonicalUserMessages: 4,
    sameRuntimeUid: true,
    liveConversation: true,
    uiContinuation: true,
    browserMutationHosting: "unproved",
    mismatchesRefused: ["identity", "document incarnation", "runtime UID"],
  });
  await page.screenshot({
    path: join(output, "continued.png"),
    fullPage: true,
  });
  process.stdout.write(
    `${JSON.stringify({ output, checked, requests: contexts.length })}\n`,
  );
} finally {
  try {
    save("requests", captures);
    save("errors", {
      errors: fixture?.errors ?? [],
      blocked: fixture?.blocked ?? [],
    });
  } finally {
    try {
      await fixture?.browser.close();
    } finally {
      try {
        await app?.stop();
      } finally {
        try {
          if (fixture) {
            const { server } = fixture;
            await new Promise<void>((done, reject) =>
              server.close((error) => (error ? reject(error) : done())),
            );
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
    }
  }
}
