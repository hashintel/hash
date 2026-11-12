/**
 * The HASH agent as the server assembles it (`hash-agent-port.md` §1–§2):
 * what it selects and installs, every tool the model is offered, pinned in a
 * snapshot as a real request carries them, and Save's description naming the
 * bound document on the first request and again after a reopen.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import {
  type ConversationId,
  createRegistry,
  GenerationTask,
  Harness,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { brunchTools, hashSaveDescription } from "@hashintel/brunch-agent";

import { toolDeltas } from "../../test/platform/hash-port/support";
import {
  context,
  fauxAssistantMessage,
  recordingModel,
} from "../../test/platform/support";
import {
  bindBrowserDocument,
  browserCallExtension,
  netToolOutputLimits,
  textToolOutputLimits,
} from "../browser-call/browser-call";
import { hashBrowserToolDefinitions } from "../browser-call/hash-browser-tools";
import { mayShowNet } from "../net-state/net-view";
import { netViewSectionKey } from "../net-state/visible-net-view";
import { createHashAgent } from "./hash-agent";
import { hashSystemSectionKey } from "./hash-agent/prompt";
import { hashSkillsSectionKey } from "./hash-agent/skills";
import { createHostBinding } from "./host-binding";

import type { Message } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";

const documentId = "net-42";
const binding = { conversationId: "conversation-1", documentId };

/** Brunch's HASH agent's tools (`hash-agent-mounting.test.ts`), less Flue's `task`, plus the two skill tools. */
const brunchHashTools = [
  "ledger_commit",
  "ledger_query",
  "ledger_query_basis",
  "hash_query_entities",
  "hash_query_entity_types",
  "hash_query_webs",
  "app_save_net",
  "petrinaut_read_guide",
  "petrinaut_get_net",
  "petrinaut_get_diagnostics",
  "petrinaut_set_net_title",
  "petrinaut_layout_auto",
  "petrinaut_create_experiment",
  ...[
    "place",
    "transition",
    "arc",
    "type",
    "type_element",
    "equation",
    "parameter",
    "scenario",
    "metric",
    "subnet",
    "component",
  ].flatMap((kind) =>
    ["create", "update", "remove"].map((verb) => `petrinaut_${verb}_${kind}`),
  ),
  "activate_skill",
  "read_skill_resource",
];

const names = (list: readonly { readonly name: string }[]) =>
  list.map(({ name }) => name);

describe("what the HASH agent selects and installs", () => {
  test("its tools are Brunch's HASH agent's, with the skill tools: 48", () => {
    const { agent } = createHashAgent();
    const tools = agent.extensions.flatMap(({ tools: offered = [] }) =>
      names(offered),
    );
    expect(tools).toHaveLength(48);
    expect(tools.toSorted()).toEqual(brunchHashTools.toSorted());
  });

  test("the prompt and the skill catalogue lead the sections; the pruning hook is its one hook; the Ledger and the basis query are sequential", () => {
    const { agent, systemPrompt } = createHashAgent();
    expect(
      agent.extensions.flatMap(({ sections = [] }) =>
        sections.map(({ key }) => key),
      ),
    ).toEqual([hashSystemSectionKey, hashSkillsSectionKey, netViewSectionKey]);
    expect(
      agent.extensions.flatMap(({ hooks = [] }) =>
        hooks.map(({ task, handlers }) => [task, Object.keys(handlers)]),
      ),
    ).toEqual([[GenerationTask.definition.name, ["afterTools"]]]);
    expect(
      agent.extensions
        .flatMap(({ tools = [] }) => tools)
        .filter(({ executionMode }) => executionMode === "sequential")
        .map(({ name }) => name)
        .toSorted(),
    ).toEqual(
      [
        brunchTools.ledgerCommit,
        brunchTools.ledgerQuery,
        brunchTools.ledgerQueryBasis,
      ].toSorted(),
    );
    expect(systemPrompt.length).toBeGreaterThan(0);
  });

  test("installs per host binding the extensions it selects, by name, and the browser-call tasks", () => {
    const { agent, extensions } = createHashAgent();
    const installed = names(extensions(createHostBinding()));
    expect(installed).toEqual([
      ...names(agent.extensions),
      browserCallExtension.name,
    ]);
    expect(names(extensions(createHostBinding()))).toEqual(installed);
  });

  test("the client's tools are the catalogue's browser tools", () => {
    expect([...createHashAgent().clientToolNames]).toEqual(
      names(hashBrowserToolDefinitions()),
    );
  });

  test("every tool that may show the net gets the 256 KiB bound, the graph reads the text bound, and no other tool any", () => {
    const tools = createHashAgent().agent.extensions.flatMap(
      ({ tools: offered = [] }) => offered,
    );
    const graphReads = new Set<string>([
      brunchTools.hashQueryEntities,
      brunchTools.hashQueryEntityTypes,
      brunchTools.hashQueryWebs,
    ]);
    for (const { name, outputLimits } of tools)
      expect({ name, outputLimits }).toEqual({
        name,
        outputLimits: mayShowNet(name)
          ? netToolOutputLimits
          : graphReads.has(name)
            ? textToolOutputLimits
            : undefined,
      });
    expect(tools.filter(({ name }) => mayShowNet(name)).length).toBe(36);
  });
});

// ─── Through a real request ──────────────────────────────────────────────────

// A closed Harness closes its storage: each Harness opens the same file anew.
let directory: string;
let file: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "durable-hash-agent-"));
  file = join(directory, "session.sqlite");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/**
 * A Harness as the server's conversation registry opens one: the agent's
 * extensions over a host binding, `Harness.open`, `bind`, then the bound
 * Save installed before scheduling resumes.
 */
const open = async (storage: Storage, models: Models) => {
  const hashAgent = createHashAgent();
  const host = createHostBinding();
  const registry = createRegistry();
  for (const extension of hashAgent.extensions(host))
    registry.install(extension);
  const harness = await Harness.open(storage, { models, registry }, context);
  host.bind(harness);
  return { hashAgent, harness, host, registry };
};

/** A conversation created, bound and its bound Save installed, as `admitBinding` does; one turn. */
const firstTurn = async () => {
  const { models, model, requests } = recordingModel([
    fauxAssistantMessage("What should the model help you decide?"),
  ]);
  const { hashAgent, harness, host, registry } = await open(
    await openNodeSqliteStorage(file),
    models,
  );
  try {
    const root = await harness.root(context, {
      agent: { ...hashAgent.agent, model },
    });
    await harness.commit(
      (tx) => bindBrowserDocument(tx, root.id, binding),
      context,
    );
    await hashAgent.installBoundSave(
      { harness, root, registry, host },
      context,
    );
    await root.submit({ type: "input", content: "We run a laundry." }, context);
    await root.waitForIdle(context);
    return { conversationId: root.id, requests };
  } finally {
    await harness.close(context);
  }
};

/** The same conversation reopened, the bound Save installed before `resume`; one more turn. */
const reopenedTurn = async (conversationId: ConversationId) => {
  const { models, requests } = recordingModel([fauxAssistantMessage("Saved?")]);
  const { hashAgent, harness, host, registry } = await open(
    await openNodeSqliteStorage(file),
    models,
  );
  try {
    const root = await harness.conversation(conversationId, context);
    if (root === undefined) throw new Error("No conversation.");
    await hashAgent.installBoundSave(
      { harness, root, registry, host },
      context,
    );
    harness.resume();
    await root.submit({ type: "input", content: "Save it." }, context);
    await root.waitForIdle(context);
    return requests;
  } finally {
    await harness.close(context);
  }
};

const offeredTools = (messages: readonly Message[]) =>
  getCurrentTools(messages).map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));

describe("every tool the model is offered", () => {
  /**
   * The snapshot pins the tools as a real request carries them, in order,
   * with Save's description naming the bound document: a change to it is a
   * change to what the model is sent, from this package or the libraries.
   */
  test("the first request carries every tool, pinned, with the bound Save and the catalogue's browser tools as they are", async () => {
    const { requests } = await firstTurn();
    const [opening] = requests;
    const offered = offeredTools(opening ?? []);
    expect(offered).toHaveLength(48);
    expect(names(offered).toSorted()).toEqual(brunchHashTools.toSorted());
    const browserTools = new Set(names(hashBrowserToolDefinitions()));
    expect(offered.filter(({ name }) => browserTools.has(name))).toEqual(
      hashBrowserToolDefinitions(documentId).map(
        ({ name, description, parameters }) => ({
          name,
          description,
          parameters,
        }),
      ),
    );
    await expect(`${JSON.stringify(offered, null, 2)}\n`).toMatchFileSnapshot(
      "./__snapshots__/hash-agent-tools.snap.json",
    );
  });

  test("Save names the bound document on the first request, and again after a reopen, with no tool change", async () => {
    const first = await firstTurn();
    const saveDescription = (messages: readonly Message[]) =>
      getCurrentTools(messages).find(
        ({ name }) => name === brunchTools.appSaveNet,
      )?.description;
    const [opening] = first.requests;
    expect(saveDescription(opening ?? [])).toBe(
      hashSaveDescription(documentId),
    );
    // The placeholder never reached the model: one declaration of the tools.
    expect(toolDeltas(opening ?? [])).toHaveLength(1);

    const [next] = await reopenedTurn(first.conversationId);
    expect(saveDescription(next ?? [])).toBe(hashSaveDescription(documentId));
    expect(toolDeltas(next ?? [])).toEqual(toolDeltas(opening ?? []));
  });
});
