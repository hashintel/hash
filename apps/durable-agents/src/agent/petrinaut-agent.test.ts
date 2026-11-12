import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  GenerationTask,
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
import { browserCallExtension } from "../browser-call/browser-call";
import { ledgerExtension } from "../ledger";
import { netViewSectionKey } from "../net-state/visible-net-view";
import { createHostBinding } from "./host-binding";
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
        brunchTools.queryBasis,
        ...CANONICAL_PETRINAUT_TOOL_NAMES,
        ...Object.values(netReaderToolNames),
      ].toSorted(),
    );
    expect(systemPrompt).toMatch(/^# Cyber-physical operational process/);
    expect(systemPrompt).not.toMatch(/ledger_compile|ledger-comments|Load `/);
  });

  test("selects the read-back pruning hook and the net_view section; no hook rewrites a request or refuses a call", () => {
    const { agent } = createPetrinautAgent();
    const hooks = agent.extensions.flatMap(({ hooks: registered = [] }) =>
      registered.map(({ task, handlers }) => [task, Object.keys(handlers)]),
    );
    expect(hooks).toEqual([[GenerationTask.definition.name, ["afterTools"]]]);
    const sections = agent.extensions.flatMap(({ sections: offered = [] }) =>
      offered.map(({ key }) => key),
    );
    expect(sections).toEqual(["brunch-petrinaut-system", netViewSectionKey]);
    const tools = agent.extensions.flatMap(
      ({ tools: offered = [] }) => offered,
    );
    expect(
      tools
        .filter(({ executionMode }) => executionMode === "sequential")
        .map(({ name }) => name)
        .toSorted(),
    ).toEqual([brunchTools.ledgerCommit, brunchTools.queryBasis].toSorted());
  });

  test("installs per host binding the extensions its agent selects by name, and the browser-call tasks", () => {
    const { agent, extensions } = createPetrinautAgent();
    const names = (list: readonly { readonly name: string }[]) =>
      list.map(({ name }) => name);
    const installed = names(extensions(createHostBinding()));
    expect(installed).toEqual([
      ...names(agent.extensions),
      browserCallExtension.name,
    ]);
    expect(names(extensions(createHostBinding()))).toEqual(installed);
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
    const host = createHostBinding();
    // As `openHarness` does; reinstalling by name replaces in place.
    registry.install(ledgerExtension);
    for (const extension of extensions(host)) registry.install(extension);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    host.bind(harness);
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
