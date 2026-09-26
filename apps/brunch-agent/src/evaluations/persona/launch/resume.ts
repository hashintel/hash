/** Reattach original stores; never import a fixture, rewrite history, or resend an admitted turn. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createFlueClient } from "@flue/sdk";
import * as v from "valibot";

import { sdcpnInitialDataSchema } from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../../conversation/identity.ts";
import { axisSettingsFromRun } from "./axis-settings.ts";
import { lastAdmittedUtterance } from "./bridge-log.ts";
import { roleSettingsFromRun } from "./role-settings.ts";

import type { PersonaBrowserSession } from "../browser-turn.ts";
import type { Page } from "@playwright/test";

const text = v.pipe(v.string(), v.minLength(1));
const runSchema = v.pipe(
  v.looseObject({
    caseDirectory: text,
    databasePath: text,
    browserProfile: text,
    panelOrigin: text,
    route: text,
    model: v.optional(v.string()),
    brunchModel: v.optional(text),
    brunchThinking: v.optional(text),
    personaModel: v.optional(text),
    personaThinking: v.optional(text),
    personaVerbosity: v.optional(text),
    personaDisclosure: v.optional(text),
  }),
  v.transform((config) => ({
    ...config,
    ...roleSettingsFromRun(config),
    ...axisSettingsFromRun(config),
  })),
);
const sessionSchema = v.object({
  url: text,
  principalKey: text,
  conversationId: text,
  uid: text,
  initialData: v.nonOptional(sdcpnInitialDataSchema),
});
export const readPersonaResume = async (directory: string) => {
  const run = resolve(directory);
  const config = v.parse(
    runSchema,
    JSON.parse(await readFile(join(run, "run.json"), "utf8")),
  );
  const session = v.parse(
    sessionSchema,
    JSON.parse(await readFile(join(run, "session.json"), "utf8")),
  );
  assert.equal(resolve(config.databasePath), join(run, "conversation.db"));
  assert.equal(
    session.url,
    `${config.panelOrigin}/agents/chat/${flueConversationIdFrom(session)}`,
  );
  const binding = session.initialData.construction?.binding;
  assert(binding, "Resume requires the original construction binding");
  assert.equal(binding.conversationId, session.conversationId);
  assert((await stat(config.databasePath)).isFile());
  assert((await stat(config.browserProfile)).isDirectory());
  const lastUtterance = await lastAdmittedUtterance(run);
  return { run, config, session, binding, lastUtterance };
};

/** Check the retained origin's storage before loading the application, which may create defaults. */
export const openRetainedPersonaBrowser = async (
  page: Page,
  origin: string,
  route: string,
  session: PersonaBrowserSession,
) => {
  // A non-app document gives access to the same origin without mounting the editor.
  const checkUrl = new URL("/__persona_identity_check__", origin).href;
  await page.route(checkUrl, (request) =>
    request.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Checking original persona document</title>",
    }),
  );
  await page.goto(checkUrl);
  await page.unroute(checkUrl);
  const saved = await page.evaluate(() => ({
    principal: localStorage.getItem("brunch-principal-v1"),
    documents: JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as unknown,
  }));
  const data = v.parse(sdcpnInitialDataSchema, session.initialData);
  const binding = data?.construction?.binding;
  assert(binding);
  assert.equal(
    saved.principal,
    session.principalKey,
    "Original browser principal is missing or changed",
  );
  const documents = v.parse(
    v.record(v.string(), v.object({ incarnationId: text })),
    saved.documents,
  );
  assert.equal(
    documents[binding.documentId]?.incarnationId,
    binding.incarnationId,
    "Original browser document is missing or changed",
  );
  await page.goto(new URL(route, origin).href);
};

/** Native recovery settles the prior submission. The next persona utterance remains agent-authored. */
export const reconcilePersonaResume = async (
  page: Page,
  session: PersonaBrowserSession,
  lastUtterance: string,
  signal?: AbortSignal,
) => {
  const client = createFlueClient({
    url: session.url,
    headers: agentOwnershipHeaders(session),
  });
  const before = await client.history();
  const lastUser = before.messages.findLast(
    (message) => message.purpose === "user",
  );
  assert(lastUser?.submissionId, "No admitted persona turn to reconcile");
  assert.equal(
    lastUser.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n"),
    lastUtterance,
    "The bridge log and Brunch disagree on the last admitted utterance; refusing automatic resume",
  );
  try {
    await client.read(lastUser.submissionId, { signal });
  } catch {
    // A failed/aborted prior response is allowed only with a native terminal settlement below.
    signal?.throwIfAborted();
  }
  await page.reload();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Message AI assistant", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Stop AI response", exact: true })
    .waitFor({ state: "hidden", timeout: 0 });
  const snapshot = await client.history();
  const settlement = snapshot.settlements.find(
    (entry) => entry.submissionId === lastUser.submissionId,
  );
  assert(
    settlement,
    "Interrupted submission has not settled; do not start the persona",
  );
  const reply = snapshot.messages
    .slice(
      snapshot.messages.findIndex((message) => message.id === lastUser.id) + 1,
    )
    .filter((message) => message.purpose === "assistant")
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      ),
    )
    .join("\n\n");
  return { session, snapshot, settlement: settlement.outcome, reply };
};
