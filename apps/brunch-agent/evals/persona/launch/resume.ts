/** Reattach original stores; never import a fixture, rewrite history, or resend an admitted turn. */
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import * as v from "valibot";

import { flueConversationId } from "../../../src/shared/conversation/identity.ts";
import {
  personaConversationClient,
  type PersonaBrowserSession,
} from "../browser-turn.ts";
import { lastAdmittedUtterance } from "./bridge-log.ts";
import { roleSettingsFromRun } from "./role-settings.ts";

import type { Page } from "@playwright/test";

const text = v.pipe(v.string(), v.minLength(1));
const runSchema = v.pipe(
  v.looseObject({
    caseDirectory: text,
    databasePath: text,
    browserProfile: text,
    /** Runs from before HASH runs name no host; they ran on the website. */
    host: v.optional(v.picklist(["website", "hash"]), "website"),
    model: v.optional(v.string()),
    brunchModel: v.optional(text),
    brunchThinking: v.optional(text),
    personaModel: v.optional(text),
    personaThinking: v.optional(text),
    guidance: v.optional(v.unknown()),
  }),
  v.transform((config) => ({
    ...config,
    ...roleSettingsFromRun(config),
  })),
);
/**
 * `session.json` as run directories hold it. The actor key keeps its
 * pre-rename field name on disk, so runs recorded before the rename still
 * resume; in memory it is the session's `actorKey`.
 */
const sessionSchema = v.pipe(
  v.object({
    url: text,
    ownerKey: text,
    conversationId: text,
    uid: text,
    initialData: v.unknown(),
  }),
  v.transform(({ ownerKey, ...session }) => ({
    ...session,
    actorKey: ownerKey,
  })),
);

/** The `session.json` text for a session, in the shape `readPersonaResume` reads. */
export const personaSessionFileText = ({
  actorKey,
  cookie: _cookie,
  ...session
}: PersonaBrowserSession): string =>
  `${JSON.stringify({ ...session, ownerKey: actorKey }, null, 2)}\n`;
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
    new URL(session.url).pathname.split("/").at(-1),
    flueConversationId(session),
    "session.json names another conversation",
  );
  assert((await stat(config.databasePath)).isFile());
  assert((await stat(config.browserProfile)).isDirectory());
  const lastUtterance = await lastAdmittedUtterance(run);
  return { run, config, session, lastUtterance };
};

/** Native recovery settles the prior submission. The next persona utterance remains agent-authored. */
export const reconcilePersonaResume = async (
  page: Page,
  session: PersonaBrowserSession,
  lastUtterance: string,
  reload: (page: Page) => Promise<void>,
  signal?: AbortSignal,
) => {
  const client = personaConversationClient(session);
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
  await reload(page);
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
