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
import { createFlueClient } from "@flue/sdk";
import { expect } from "@playwright/test";
import { parse } from "valibot";

import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import {
  updateWorkpieceOutputSchema,
  workpieceReadOutputSchema,
} from "@hashintel/brunch-agent/flue";

import brunchPersonaTestingExtension from "../.pi/extensions/brunch-persona-testing.ts";
import { agentOwnershipHeaders } from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { browserSessionOptions } from "../src/evaluations/persona/browser-session.ts";
import {
  createBrunchTurnTool,
  type BrunchTurnTool,
} from "../src/evaluations/persona/brunch-turn.ts";
import { openPersonaConversation } from "../src/evaluations/persona/launch.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { browserResultFrom } from "./browser-result.ts";
import {
  nativeSchemaProvider,
  type NativeRequestCapture,
} from "./native-schema-provider.ts";

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
  const browserResult = (context: Context, name: string) =>
    browserResultFrom(
      context.messages.flatMap((message) =>
        typeof message.content === "string"
          ? [message.content]
          : message.content.flatMap((part) =>
              part.type === "text" ? [part.text] : [],
            ),
      ),
      name,
      "Missing causal browser result",
    );
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
    (context: Context) => {
      const current = parse(
        updateWorkpieceOutputSchema,
        toolOutput(context, "update_workpiece"),
      );
      assert.equal(current.revisionId, revisionId);
      assert.equal(current.markdown, markdown);
      assert.deepEqual(
        current.evidence?.[0]?.messageIds,
        evidence.at(-1)?.sourceIds,
      );
      checked++;
      return text(
        `TEST synthetic reply ${revisionId}. What else should I know?`,
      );
    },
  ];
  const uiSend = async (body: string, done: string) => {
    await page.getByRole("tab", { name: "AI", exact: true }).click();
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
  faux.setResponses([text("TEST ready for your account.")]);
  const { session: config } = await openPersonaConversation(
    page,
    origin,
    "Hello, I would like to describe our process.",
  );
  await expect(
    page.getByText("TEST ready for your account.", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
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
  const displayTail = `\n\n${"TEST preserved content for a long workpiece.\n".repeat(80)}`;
  const markdowns = [
    `# TEST simulated account\n\nOne operator handles each item.\n\nTiming is unknown.${displayTail}`,
    `# TEST simulated account\n\nTwo operators are needed for each item, not one.\n\nTiming is unknown.${displayTail}`,
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
    await page.getByRole("tab", { name: "Workpiece", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "TEST simulated account",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("brunch-current-workpiece")).toHaveText(
      markdown,
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("region", { name: "Brunch workpiece and why" }),
    ).toContainText(`Recorded settlement from ${revisionId}`);
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
    if (index === 1) {
      const assistant = page.getByRole("complementary", {
        name: "AI assistant",
      });
      const before = await assistant.boundingBox();
      const handle = await page
        .getByRole("button", { name: "Resize AI assistant", exact: true })
        .boundingBox();
      assert(before && handle);
      await page.mouse.move(
        handle.x + handle.width / 2,
        handle.y + handle.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        handle.x + handle.width / 2 - 80,
        handle.y + handle.height / 2,
        { steps: 5 },
      );
      await page.mouse.up();
      await expect
        .poll(async () => (await assistant.boundingBox())?.width ?? 0)
        .toBeGreaterThan(before.width + 40);
      const composer = page.getByRole("textbox", {
        name: "Message AI assistant",
        exact: true,
      });
      await composer.fill("TEST unsent draft survives tab switching");
      await page.getByRole("tab", { name: "AI", exact: true }).click();
      await expect(composer).toHaveValue(
        "TEST unsent draft survives tab switching",
      );
      await page.getByRole("tab", { name: "Workpiece", exact: true }).click();
      await expect(composer).toHaveValue(
        "TEST unsent draft survives tab switching",
      );
      await composer.fill("");
    }
    await expect(
      page.getByRole("tab", { name: "Workpiece", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByText("Synthetic construction candidate", { exact: false }),
    ).toHaveCount(0);
    await page.screenshot({
      path: join(output, `revision-${index + 1}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("tab", { name: "AI", exact: true }).click();
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
  // The persona has no browser host. Retain its unanswered read, then ensure a
  // fresh ordinary UI read and mutation do not treat that request as an observation.
  faux.setResponses([
    call("getLatestNetDefinition", {}, "persona-unhosted-browser-read"),
  ]);
  await assert.rejects(
    persona.execute(
      "TEST-persona-unhosted-browser-read",
      { message: "TEST inspect the browser." },
      AbortSignal.timeout(30_000),
    ),
    /requested client tool getLatestNetDefinition/u,
  );
  // Retain an unanswered guide read through the same ordinary SDK boundary.
  // It has no browser host and must not be completed or replayed on reopen.
  const unhostedGuideReadId = "sdk-unhosted-guide-read";
  faux.setResponses([
    call("readPetrinautDoc", { doc: "ai-assistant" }, unhostedGuideReadId),
  ]);
  const unhostedGuideAdmission = await client.send({
    message: {
      kind: "user",
      body: "TEST read the assistant guide without a browser host.",
    },
    uid: config.uid,
  });
  await client.read(unhostedGuideAdmission, {
    signal: AbortSignal.timeout(30_000),
  });
  // Stop persona driving; reopen the same browser profile/document and continue
  // through the ordinary composer. No seeded workpiece, direct state write or new ID.
  // A long workpiece must not cover the assistant opener on a short desktop viewport.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await expect(page.getByTestId("brunch-current-workpiece")).toHaveText(
    markdowns[1]!,
    { timeout: 30_000 },
  );
  const reopenedHistory = await client.history();
  const reopenedClientHistory = clientToolHistoryFrom(reopenedHistory.messages);
  assert(
    reopenedClientHistory.calls.some(
      (request) =>
        request.toolCallId === unhostedGuideReadId &&
        request.toolName === "readPetrinautDoc",
    ),
  );
  assert(
    !reopenedClientHistory.results.some(
      (result) => result.toolCallId === unhostedGuideReadId,
    ),
  );
  checked++;
  const continuation =
    "TEST UI continuation: keep timing unknown and create one test configuration parameter, not an operational value.";
  faux.setResponses([
    call("brunch_workpiece", {}, "ui-continuation-read"),
    (context: Context) => {
      const queried = parse(
        workpieceReadOutputSchema,
        toolOutput(context, "brunch_workpiece"),
      ).currentWorkpiece;
      assert.deepEqual(queried, toolOutput(context, "update_workpiece"));
      checked++;
      return call("getLatestNetDefinition", {}, "ui-fresh-browser-read");
    },
    (context: Context) => {
      const observation = browserResult(context, "getLatestNetDefinition")
        .metadata?.observation;
      assert(observation, "Fresh UI read must have an independent observation");
      checked++;
      return call(
        "addParameter",
        {
          id: "test_ui_parameter",
          name: "Test UI parameter",
          variableName: "test_ui_parameter",
          type: "real",
          defaultValue: "1",
          brunch: {
            basis: { kind: "absent", reason: "Synthetic browser handoff" },
            observationToolCallId: observation.toolCallId,
            requestedBaseHash: observation.observed.sha256,
          },
        },
        "ui-fresh-parameter",
      );
    },
    (context: Context) => {
      const record = browserResult(context, "addParameter").metadata
        ?.mutationRecord;
      assert.equal(record?.outcome, "applied");
      assert.equal(
        record.attempts[0]?.post?.definition.parameters.find(
          (parameter) => parameter.id === "test_ui_parameter",
        )?.defaultValue,
        "1",
      );
      checked++;
      return call(
        "readPetrinautDoc",
        { doc: "ai-assistant" },
        "ui-construction-guide-read",
      );
    },
    (context: Context) => {
      const guide = browserResult(context, "readPetrinautDoc").output;
      if (typeof guide !== "string")
        throw new Error("Guide read did not return text.");
      assert(guide.includes("AI Assistant"));
      checked++;
      return text("TEST continued with a fresh UI browser mutation.");
    },
  ]);
  await uiSend(
    continuation,
    "TEST continued with a fresh UI browser mutation.",
  );
  await page.getByRole("tab", { name: "Workpiece", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Brunch workpiece and why" }),
  ).toContainText("State queried by ui-continuation-read", { timeout: 30_000 });
  assert.equal(
    checked,
    9,
    "Reopened workpiece query, fresh browser observation, mutation and guide read must all be checked",
  );
  const final = await client.history();
  const finalClientHistory = clientToolHistoryFrom(final.messages);
  const clientResults = finalClientHistory.results;
  assert(
    finalClientHistory.calls.some(
      (request) =>
        request.toolCallId === unhostedGuideReadId &&
        request.toolName === "readPetrinautDoc",
    ),
  );
  assert(
    !clientResults.some(
      (result) => result.toolCallId === "persona-unhosted-browser-read",
    ),
  );
  assert(
    !clientResults.some((result) => result.toolCallId === unhostedGuideReadId),
  );
  checked++;
  assert(
    clientResults.some((result) => result.toolCallId === "ui-fresh-parameter"),
  );
  assert(
    clientResults.some(
      (result) => result.toolCallId === "ui-construction-guide-read",
    ),
  );
  assert.equal(
    checked,
    10,
    "Both unanswered reads must remain undelivered while the fresh guide read settles",
  );
  assert.equal(final.conversationId, initialHistory.conversationId);
  assert.equal(
    final.messages.filter((message) => message.purpose === "user").length,
    6,
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
  assert(sends.length >= 6);
  for (const send of sends.slice(1, 3)) {
    assert.equal(send.uid, config.uid);
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
    canonicalUserMessages: 6,
    sameRuntimeUid: true,
    liveConversation: true,
    uiContinuation: true,
    unhostedPersonaReadRetained: true,
    unhostedGuideReadRetained: true,
    freshUiReadThenMutation: true,
    browserMutationHosting:
      "ordinary UI only; persona hosting remains unavailable",
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
