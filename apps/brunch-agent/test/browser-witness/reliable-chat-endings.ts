/**
 * Manual Chrome witness against the built website and Brunch server. No paid
 * model: inject scripted provider events, including a call followed by failure.
 * Build as for test:manual:browser, then run this file with node --experimental-strip-types.
 */
import assert from "node:assert/strict";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { expect } from "@playwright/test";

import { brunchEnv } from "../../src/env.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";
import {
  openBrowserFixture,
  prepareWitnessProcess,
  toolCall,
} from "./browser-fixture.ts";

import type { Page } from "@playwright/test";

const output = prepareWitnessProcess("reliable-chat-endings");
process.env[brunchEnv.chatModel] = "openai/faux-model";
const faux = fauxProvider({
  provider: "openai",
  models: [{ id: "faux-model", reasoning: true }],
});
const app = await loadBuiltBrunchApplication();
setProvider(faux.provider);
const fixture = await openBrowserFixture(app);
const scenario = {
  id: "baseline",
  name: "Baseline",
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
};

const submit = async (page: Page, prompt: string) => {
  const composer = page.getByRole("textbox", { name: "Message AI assistant" });
  await composer.fill(prompt);
  await composer.press("Enter");
};
const expectReady = async (page: Page) => {
  await expect(
    page.getByRole("button", { name: "Stop AI response" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Waiting for your decision", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Message AI assistant" }),
  ).toBeEnabled();
};
const userPosts = () =>
  fixture.deliveries.filter(
    ({ body }) => (JSON.parse(body) as { kind?: string }).kind === "user",
  ).length;

const failedRemoval = async () => {
  const page = await fixture.openAssistant();
  const callsBefore = faux.state.callCount;
  const postsBefore = userPosts();
  faux.setResponses([
    toolCall("readNetOutline", {}, "outline"),
    toolCall("addScenario", scenario, "scenario"),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "removeScenario",
          { scenarioId: scenario.id },
          { id: "failed-removal" },
        ),
      ],
      { stopReason: "error", errorMessage: "400 Bad Request: invalid input" },
    ),
  ]);
  await submit(page, "Add then remove a baseline scenario.");
  const row = page.locator('button:has([data-tool-status="no-result"])');
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row).toContainText("No result — response failed");
  await expect(row).toHaveAttribute("data-tone", "neutral");
  await expect(row).not.toHaveAttribute("aria-busy", "true");
  await expectReady(page);
  await expect(
    page.getByRole("button", { name: "Allow", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Used 3 tools", exact: true }).click();
  await expect(row).toBeVisible();
  await page.screenshot({ path: join(output, "failed-removal.png") });
  assert.equal(faux.state.callCount - callsBefore, 3);
  assert.equal(userPosts() - postsBefore, 1);

  await page.reload();
  const showAssistant = page.getByRole("button", {
    name: "Show AI assistant",
    exact: true,
  });
  await showAssistant.click();
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  await expect(row).toContainText("No result — response failed");
  await expectReady(page);
  assert.equal(faux.state.callCount - callsBefore, 3);

  faux.setResponses([
    fauxAssistantMessage("A new request works after failure."),
  ]);
  await fixture.ask(
    page,
    "Try again, just reply.",
    "A new request works after failure.",
    20_000,
  );
  await expectReady(page);
  assert.equal(userPosts() - postsBefore, 2);
  await page.close();
};

/** In-band tools finish server-side; this is not the SDK client-followup reproducer. */
const emptyServerFollowup = async () => {
  const page = await fixture.openAssistant();
  const callsBefore = faux.state.callCount;
  const postsBefore = userPosts();
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, "empty-read"),
    fauxAssistantMessage([]),
  ]);
  await submit(page, "Read the net, then finish without text.");
  await expect(page.locator('[data-tool-status="ok"]')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect.poll(() => faux.state.callCount).toBe(callsBefore + 2);
  await expectReady(page);
  await expect(
    page.getByText("No reply received", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("AI assistant error", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: join(output, "empty-followup.png") });
  process.stdout.write(
    `EMPTY_SERVER_ENDING ${JSON.stringify({
      modelCalls: faux.state.callCount - callsBefore,
      userPosts: userPosts() - postsBefore,
      noReplyNotices: await page
        .getByText("No reply received", { exact: true })
        .count(),
    })}\n`,
  );
  // A fresh turn also proves the empty response released the composer.
  faux.setResponses([
    fauxAssistantMessage("A new request works after an empty reply."),
  ]);
  await fixture.ask(
    page,
    "Please reply now.",
    "A new request works after an empty reply.",
    20_000,
  );
  await expectReady(page);
  assert.equal(faux.state.callCount - callsBefore, 3);
  assert.equal(userPosts() - postsBefore, 2);
  await expect(
    page.getByText("No reply received", { exact: true }),
  ).toHaveCount(0);
  await page.close();
};

const stopPendingRemoval = async () => {
  const page = await fixture.openAssistant();
  const callsBefore = faux.state.callCount;
  const postsBefore = userPosts();
  faux.setResponses([
    toolCall("readNetOutline", {}, "stop-outline"),
    toolCall("addScenario", scenario, "stop-scenario"),
    toolCall("removeScenario", { scenarioId: scenario.id }, "stop-removal"),
  ]);
  await submit(page, "Add then remove a baseline scenario, asking permission.");
  await expect(
    page.getByRole("button", { name: "Allow", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Stop AI response" }).click();
  await expectReady(page);
  await expect(
    page.getByRole("button", { name: "Allow", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No reply received", { exact: true }),
  ).toHaveCount(0);
  assert.equal(faux.state.callCount - callsBefore, 3);
  faux.setResponses([fauxAssistantMessage("A new request works after Stop.")]);
  await fixture.ask(
    page,
    "Leave it; just reply.",
    "A new request works after Stop.",
    20_000,
  );
  await expectReady(page);
  assert.equal(userPosts() - postsBefore, 2);
  await page.close();
};

try {
  for (const witness of [
    failedRemoval,
    emptyServerFollowup,
    stopPendingRemoval,
  ]) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Cases share the synthetic response queue.
    await witness();
    process.stdout.write(`PASS ${witness.name}\n`);
  }
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(fixture.blocked, []);
  process.stdout.write(`BROWSER_ENDINGS_PASS ${output}\n`);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ errors: fixture.errors, blocked: fixture.blocked, calls: faux.state.callCount })}\n`,
  );
  throw error;
} finally {
  try {
    await fixture.close();
  } finally {
    await app.stop();
  }
}
