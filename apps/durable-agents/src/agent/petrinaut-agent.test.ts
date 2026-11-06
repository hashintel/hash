import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";

import {
  brunchTools,
  CANONICAL_PETRINAUT_TOOL_NAMES,
  netReaderToolNames,
} from "@hashintel/brunch-agent";

import { fauxAssistantMessage, scriptedModel } from "../../test/scripted-model";
import { ledgerExtension } from "../ledger";
import { createPetrinautAgent } from "./petrinaut-agent";

const context = BACKGROUND_CONTEXT;

describe("the minimal Petrinaut agent", () => {
  test("selects the Ledger, every browser tool the panel executes, and Brunch's prompt", () => {
    const { agent, systemPrompt } = createPetrinautAgent();
    const tools = agent.extensions.flatMap(({ tools: offered = [] }) =>
      offered.map(({ name }) => name),
    );
    expect(tools.toSorted()).toEqual(
      [
        brunchTools.ledgerCommit,
        ...CANONICAL_PETRINAUT_TOOL_NAMES,
        ...Object.values(netReaderToolNames),
      ].toSorted(),
    );
    expect(systemPrompt).toMatch(/^# Cyber-physical operational process/);
    expect(systemPrompt).not.toMatch(/ledger_compile|ledger-comments|Load `/);
  });

  test("installs beside the server's own extensions and sends its prompt", async () => {
    const { extensions, agent, systemPrompt } = createPetrinautAgent();
    const seen: string[] = [];
    const { models, model } = scriptedModel([
      (request) => {
        seen.push(JSON.stringify(request.messages));
        return fauxAssistantMessage("What should the model help you decide?");
      },
    ]);
    const registry = createRegistry();
    // As `openHarness` does; reinstalling by name replaces in place.
    registry.install(ledgerExtension);
    for (const extension of extensions) registry.install(extension);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    const root = await harness.root(context, { agent: { ...agent, model } });
    const submission = await root.submit(
      { type: "input", content: "We run a laundry." },
      context,
    );
    expect((await submission.wait(context)).status).toBe("done");
    expect(seen[0]).toContain(
      JSON.stringify(systemPrompt.slice(0, 60)).slice(1, -1),
    );
    await harness.close(context);
  });
});
