/** Reattach original stores; never import a fixture, rewrite history, or resend an admitted turn. */
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createFlueClient } from "@flue/sdk";
import * as v from "valibot";

import { sdcpnInitialDataSchema } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import { isAwaitingClient } from "../../../conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../../conversation/identity.ts";
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
  }),
  v.transform((config) => ({
    ...config,
    ...roleSettingsFromRun(config),
  })),
);
const sessionSchema = v.object({
  url: text,
  principalKey: text,
  conversationId: text,
  uid: text,
  initialData: v.nonOptional(sdcpnInitialDataSchema),
});
const piMessageSchema = v.object({
  type: v.literal("message"),
  message: v.object({
    role: v.literal("assistant"),
    content: v.array(v.unknown()),
  }),
});
const piTurnSchema = v.object({
  type: v.literal("toolCall"),
  name: v.literal("brunch_turn"),
  arguments: v.object({ message: text }),
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
  const sessions = (await readdir(join(run, "pi/sessions"))).filter((name) =>
    name.endsWith(".jsonl"),
  );
  assert.equal(
    sessions.length,
    1,
    "Resume requires one unambiguous original Pi session",
  );
  const sessionFile = sessions[0];
  assert(sessionFile);
  const piSession = join(run, "pi/sessions", sessionFile);
  const entries = (await readFile(piSession, "utf8"))
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
  const turns = entries.flatMap((entry) => {
    const message = v.safeParse(piMessageSchema, entry);
    return message.success
      ? message.output.message.content.flatMap((part) => {
          const turn = v.safeParse(piTurnSchema, part);
          return turn.success ? [turn.output.arguments.message] : [];
        })
      : [];
  });
  const lastUtterance = turns.at(-1);
  assert(lastUtterance, "Original Pi session has no persona turn to reconcile");
  return { run, config, session, binding, piSession, lastUtterance };
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

/** Native recovery settles the prior submission. The next persona utterance remains model-authored. */
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
    "Pi and Brunch disagree on the last admitted utterance; refusing automatic resume",
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
  assert(settlement, "Interrupted submission has not settled; do not start Pi");
  const results = clientToolHistoryFrom(snapshot.messages).results;
  for (const message of snapshot.messages)
    for (const part of message.parts) {
      if (
        part.type === "dynamic-tool" &&
        part.state === "output-available" &&
        isAwaitingClient(part.output)
      ) {
        assert(
          results.some((result) => result.toolCallId === part.toolCallId),
          `Unanswered browser call ${part.toolCallId}; automatic resume is not safe`,
        );
      }
    }
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
  const prompt = [
    "Operator resume of your existing persona session. The interrupted connection has been reconciled with Brunch's original conversation. Continue the same persona and objective from your saved history.",
    "Your last brunch_turn utterance WAS admitted. Do not resend it or repeat the opening. This reconciliation permits a new turn; it does not authorize replay of an indeterminate submission.",
    `The last Brunch submission settled as: ${settlement.outcome}. Existing workpiece/model changes were retained.`,
    "If the response was interrupted, ask Brunch to pick up where it left off in the person's own words, without repeating operational facts. Otherwise answer its actual reply naturally. Keep this operator notice private and use only brunch_turn. Stop on any new tool failure.",
    `Actual latest Brunch prose (may be partial if not completed):\n${reply.trim() ? reply : "No reply prose was retained."}`,
  ].join("\n\n");
  return { session, snapshot, prompt };
};
