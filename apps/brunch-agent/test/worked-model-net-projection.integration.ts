/**
 * Injected in-memory fixture -> owned browser net projection -> mutation ->
 * reopen -> clean net projection.
 *
 * This proves only net mutation, reopen, clean-net and principal isolation
 * mechanics. It does not prove build discovery, Postgres, retained fixture
 * session/workpiece hydration or provenance remapping.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { Hono } from "hono";

import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import { createWorkedModelNetProjectionRouter } from "../src/http/worked-models.ts";
import {
  createInMemoryWorkedModelStore,
  type WorkedModelFixture,
} from "../src/worked-model-store.ts";
import { openBrowserFixture } from "./browser-fixture.ts";
import { nativeSchemaProvider } from "./native-schema-provider.ts";

import type { BuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

const output = mkdtempSync(join(tmpdir(), "worked-model-net-projection-"));
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
const store = createInMemoryWorkedModelStore(
  () => `net-projection-tracer-${nextId++}`,
);
const fixture: WorkedModelFixture = {
  bundleKey: "inventory-purchasing",
  fixtureVersion: "net-projection-tracer-v1",
  sourceManifestSha256: "f".repeat(64),
  title: "Inventory purchasing net-projection tracer",
  session: {
    v: 1,
    conversationId: "fixture-source",
    offset: "fixture-offset",
    messages: [],
    settlements: [],
  },
  workpiece: "# Net-projection tracer\n\nOne receiving place.",
  definition: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
  revisionId: "net-projection-tracer-fixture-revision",
};
await store.seed([fixture]);

const built = await loadBuiltBrunchApplication();
const workedModelApp = new Hono();
workedModelApp.route(
  "/api/worked-models",
  createWorkedModelNetProjectionRouter(store),
);
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
// I executes canonical Petrinaut calls in-band; no prior read or Ledger basis is required.
const receivingPlace = {
  id: "receiving",
  name: "Receiving",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

try {
  faux.setResponses([
    tool("addPlace", receivingPlace, "place-1"),
    fauxAssistantMessage([
      fauxText("Worked-model net projection mutation completed."),
    ]),
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
    .getByText("Worked-model net projection mutation completed.", {
      exact: true,
    })
    .waitFor({ timeout: 60_000 });

  const principalKey = await page.evaluate(
    () => localStorage.getItem("brunch-principal-v1") ?? "",
  );
  assert(principalKey);
  const changed = await store.resolveNetProjection({
    bundleKey: fixture.bundleKey,
    principalKey,
  });
  assert(changed);
  assert.equal(changed.definition.places[0]?.id, "receiving");

  await page.reload();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await page
    .getByText("Worked-model net projection mutation completed.", {
      exact: true,
    })
    .waitFor({ timeout: 30_000 });
  const reopened = await store.resolveNetProjection({
    bundleKey: fixture.bundleKey,
    principalKey,
  });
  assert(reopened);
  assert.equal(reopened.copyId, changed.copyId);
  assert.equal(reopened.definition.places[0]?.id, "receiving");

  await page.keyboard.press("Meta+k");
  await page
    .getByRole("button", {
      name: /Create a fresh net projection from this template/u,
    })
    .click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("brunch-principal-v1");
    return raw !== null;
  });
  const clean = await store.resolveNetProjection({
    bundleKey: fixture.bundleKey,
    principalKey,
  });
  assert(clean);
  assert.notEqual(clean.copyId, changed.copyId);
  assert.equal(clean.definition.places.length, 0);

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
    const sibling = await store.resolveNetProjection({
      bundleKey: fixture.bundleKey,
      principalKey: siblingPrincipal,
    });
    assert(sibling);
    assert.notEqual(sibling.copyId, clean.copyId);
    assert.equal(sibling.definition.places.length, 0);
  } finally {
    await siblingContext.close();
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  process.stdout.write(
    `WORKED_MODEL_NET_PROJECTION ${JSON.stringify({
      fixtureSource: "in-memory-injected",
      provenMechanics: [
        "net-mutation",
        "reopen",
        "clean-net",
        "principal-isolation",
      ],
      changedCopyId: changed.copyId,
      cleanCopyId: clean.copyId,
      reopened: reopened.copyId === changed.copyId,
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
