/** Build-seeded bundle -> owned browser copy -> mutation -> reopen -> clean copy. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { Hono } from "hono";

import {
  mutatePetrinetToolName,
  type MutatePetrinetOperation,
} from "@hashintel/brunch-agent-plugin-sdcpn";

import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { createWorkedModelRouter } from "../src/http/worked-models.ts";
import {
  createInMemoryWorkedModelStore,
  type WorkedModelFixture,
} from "../src/worked-model-store.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { browserResultFrom } from "./browser-result.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

import type { BuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

const output = mkdtempSync(join(tmpdir(), "worked-model-copy-"));
const website = resolve(
  process.env.M7_WEBSITE_DIST ?? "../petrinaut-website/dist",
);
process.env.NODE_ENV = "test";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
installFauxProvider(nativeSchemaProvider(faux.provider, [], []));

let nextId = 0;
const store = createInMemoryWorkedModelStore(() => `copy-tracer-${nextId++}`);
const fixture: WorkedModelFixture = {
  bundleKey: "inventory-purchasing",
  fixtureVersion: "copy-tracer-v1",
  sourceManifestSha256: "f".repeat(64),
  title: "Inventory purchasing copy tracer",
  session: {
    v: 1,
    conversationId: "fixture-source",
    offset: "fixture-offset",
    messages: [],
    settlements: [],
  },
  workpiece: "# Copy tracer\n\nOne receiving place.",
  definition: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
  revisionId: "copy-tracer-fixture-revision",
};
await store.seed([fixture]);

const built = await loadBuiltBrunchApplication();
const workedModelApp = new Hono();
workedModelApp.route("/api/worked-models", createWorkedModelRouter(store));
const app: BuiltBrunchApplication = {
  fetch: (request) =>
    new URL(request.url).pathname.startsWith("/api/worked-models/")
      ? workedModelApp.fetch(request)
      : built.fetch(request),
  stop: () => built.stop(),
};
const { server, browser, page, origin, errors, blocked } =
  await openBrowserFixture(app, website);

const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const textsFrom = (context: Context) =>
  context.messages.flatMap((message) =>
    typeof message.content === "string"
      ? [message.content]
      : message.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
  );
const markdown = "# Copy tracer\n\nOne receiving place.";
const operation: MutatePetrinetOperation = {
  operationId: "add-receiving",
  basisId: "receiving-basis",
  type: "addPlace",
  input: {
    id: "receiving",
    name: "Receiving",
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  },
};
const locateBasis = (context: Context) => {
  const result = context.messages.findLast(
    (message) =>
      message.role === "toolResult" && message.toolName === "read_workpiece",
  );
  assert(result?.role === "toolResult" && !result.isError);
  const content =
    typeof result.content === "string"
      ? result.content
      : result.content
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("");
  const located = JSON.parse(content) as {
    currentWorkpiece: { revisionId: string; sha256: string };
    locatorLookup: {
      queries: { occurrences: { start: number; end: number }[] }[];
    };
  };
  const locator = located.locatorLookup.queries[0]?.occurrences[0];
  assert(locator);
  return {
    kind: "declared" as const,
    revisionId: located.currentWorkpiece.revisionId,
    sha256: located.currentWorkpiece.sha256,
    locators: [locator],
    rationale: "Synthetic copy tracer basis.",
    scope: "operation" as const,
  };
};

try {
  faux.setResponses([
    tool("mutate_workpiece", { markdown }, "revision-1"),
    () =>
      tool(
        "read_workpiece",
        { locateTexts: ["One receiving place."] },
        "locate-1",
      ),
    () => tool("getLatestNetDefinition", {}, "read-1"),
    (context: Context) => {
      const observation = browserResultFrom(
        textsFrom(context),
        "getLatestNetDefinition",
        "Missing copy observation",
      ).metadata?.observation;
      assert(observation);
      return tool(
        mutatePetrinetToolName,
        {
          observation: {
            toolCallId: observation.toolCallId,
            baseHash: observation.observed.sha256,
          },
          bases: [{ basisId: "receiving-basis", basis: locateBasis(context) }],
          operations: [operation],
        },
        "mutate-1",
      );
    },
    fauxAssistantMessage([fauxText("Worked-model copy mutation completed.")]),
  ]);
  await page.goto(`${origin}/?bundle=inventory-purchasing`);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  await composer.fill("Record and add the receiving place.");
  await composer.press("Enter");
  await page
    .getByText("Worked-model copy mutation completed.", { exact: true })
    .waitFor({ timeout: 60_000 });

  const principalKey = await page.evaluate(
    () => localStorage.getItem("brunch-principal-v1") ?? "",
  );
  assert(principalKey);
  const changed = await store.resolveCopy({
    bundleKey: fixture.bundleKey,
    principalKey,
  });
  assert.equal(changed?.definition.places[0]?.id, "receiving");

  await page.reload();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await page
    .getByText("Worked-model copy mutation completed.", { exact: true })
    .waitFor({ timeout: 30_000 });
  const reopened = await store.resolveCopy({
    bundleKey: fixture.bundleKey,
    principalKey,
  });
  assert.equal(reopened?.copyId, changed?.copyId);
  assert.equal(reopened?.definition.places[0]?.id, "receiving");

  await page.keyboard.press("Meta+k");
  await page
    .getByRole("button", {
      name: /Create a clean copy of this worked model/u,
    })
    .click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("brunch-principal-v1");
    return raw !== null;
  });
  const clean = await store.resolveCopy({
    bundleKey: fixture.bundleKey,
    principalKey,
  });
  assert.notEqual(clean?.copyId, changed?.copyId);
  assert.equal(clean?.definition.places.length, 0);

  const siblingContext = await browser.newContext();
  try {
    const siblingPage = await siblingContext.newPage();
    await siblingPage.goto(`${origin}/?bundle=inventory-purchasing`);
    await siblingPage.waitForFunction(
      () => localStorage.getItem("brunch-principal-v1") !== null,
    );
    const siblingPrincipal = await siblingPage.evaluate(
      () => localStorage.getItem("brunch-principal-v1") ?? "",
    );
    assert(siblingPrincipal);
    assert.notEqual(siblingPrincipal, principalKey);
    const sibling = await store.resolveCopy({
      bundleKey: fixture.bundleKey,
      principalKey: siblingPrincipal,
    });
    assert.notEqual(sibling?.copyId, clean?.copyId);
    assert.equal(sibling?.definition.places.length, 0);
  } finally {
    await siblingContext.close();
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write(
    `WORKED_MODEL_COPY ${JSON.stringify({
      changedCopyId: changed?.copyId,
      cleanCopyId: clean?.copyId,
      reopened: reopened?.copyId === changed?.copyId,
    })}\n`,
  );
} finally {
  try {
    await browser.close();
  } finally {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    await app.stop();
  }
}
