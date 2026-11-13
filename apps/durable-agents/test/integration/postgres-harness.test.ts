import { randomUUID } from "node:crypto";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type Conversation } from "@earendil-works/pi-durable";
import { Pool } from "pg";
import { afterAll, expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { openHarness } from "../../src/harness";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../src/storage/postgres/postgres-storage";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../scripted-model";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });

afterAll(() => admin.end());

const transcript = async (conversation: Conversation) =>
  (await conversation.entries({ order: "ascending" }, 100, undefined, context))
    .items;

test("a ledger_commit turn on Postgres survives close and reopen", async () => {
  const schema = `pi_durable_test_${randomUUID().replaceAll("-", "")}`;
  try {
    const { models, model } = scriptedModel([
      fauxAssistantMessage(
        fauxToolCall(
          brunchTools.ledgerCommit,
          {
            entries: [
              [
                "entity/create",
                {
                  name: "Dryer",
                  kind: "resource",
                  origin: "stated",
                  status: "confirmed",
                },
              ],
            ],
          },
          { id: "call-1" },
        ),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Recorded the dryer."),
    ]);
    const harness = await openHarness(
      await openPostgresStorage({ pool: poolConfig, schema }),
      { models },
      context,
    );
    const root = await harness.root(context, { agent: { model } });
    const submission = await root.submit(
      { type: "input", content: "We have one dryer." },
      context,
    );
    const settled = await submission.wait(context);
    expect(settled.status).toBe("done");
    const before = await transcript(root);
    await harness.close(context);

    // The turn as the model saw it: input, the tool call, its result, the answer.
    expect(
      before
        .filter(({ kind }) => kind !== "pi.system")
        .map((entry) => entry.model?.[0]?.role),
    ).toEqual(["user", "assistant", "toolResult", "assistant"]);
    expect(before.at(-1)?.model?.[0]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Recorded the dryer." }],
    });

    const reopened = await openHarness(
      await openPostgresStorage({ pool: poolConfig, schema }),
      { models: scriptedModel([]).models },
      context,
    );
    try {
      expect(await transcript(await reopened.root(context))).toEqual(before);
    } finally {
      await reopened.close(context);
    }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});
