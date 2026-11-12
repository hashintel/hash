/**
 * HASH's browser tools over the real waiting tool, a scripted model and a
 * scripted browser (`hash-agent-port.md` §3.2–3.5, §3.7): what is refused
 * before issue and in what words, what is issued and against which view, and
 * what the model and the UI are shown of each result.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import {
  type Conversation,
  type ConversationId,
  createRegistry,
  Harness,
  type JsonObject,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { describe, expect, test, vi } from "vitest";

import {
  brunchTools,
  type BrowserCallFailureDisposition,
  canonicalContent,
  hashEntityReadForModel,
  hashNoNetViewRefusal,
  hashPetrinautTools,
  hashProcessEditorId,
  hashSaveDescription,
  hashSaveUnconfirmedNote,
  hashWebReadForModel,
  unknownEditorRefusal,
} from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import { createHostBinding } from "../agent/host-binding";
import { noNetViewRefusal } from "../net-state/net-freshness";
import {
  pruneEdits,
  renderNetChange,
  visibleNetView,
} from "../net-state/visible-net-view";
import {
  bindBrowserDocument,
  browserCallExtension,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCall,
  claimBrowserCallAs,
  failBrowserCall,
  finishBrowserCall,
  startBrowserCall,
  textToolOutputLimits,
} from "./browser-call";
import {
  createHashBrowserToolsExtension,
  createHashSaveExtension,
  hashBrowserToolDefinitions,
  hashSaveExtensionName,
  placeholderSaveDescription,
} from "./hash-browser-tools";

import type { Message, ToolResultMessage } from "@earendil-works/pi-ai";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;
const documentId = "net-42";
const binding = { conversationId: "conversation-1", documentId };
const tab = { claimant: "tab-1", binding: canonicalContent(binding) };

const editor = { editor_id: hashProcessEditorId };
const getNet = { ...editor, detail: "outline" };
const place = {
  ...editor,
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};
const saveInput = { documentId };

const call = (
  toolName: string,
  id: string,
  args: JsonObject = {},
): FauxResponseStep =>
  fauxAssistantMessage(fauxToolCall(toolName, args, { id }), {
    stopReason: "toolUse",
  });

/** A Harness with HASH's browser tools and Save over its host binding, and a bound root conversation. */
const open = async (responses: FauxResponseStep[]) => {
  const requests: Message[][] = [];
  const { models, model } = scriptedModel(
    responses.map((step): FauxResponseStep => (request, ...rest) => {
      requests.push(structuredClone(request.messages));
      return typeof step === "function" ? step(request, ...rest) : step;
    }),
  );
  const host = createHostBinding();
  const tools = createHashBrowserToolsExtension(host);
  const save = createHashSaveExtension(host, documentId);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(tools);
  registry.install(save);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  host.bind(harness);
  const root = await harness.root(context, {
    agent: { model, extensions: [tools, save] },
  });
  await harness.commit(
    (tx) => bindBrowserDocument(tx, root.id, binding),
    context,
  );
  return { harness, root, requests, host, registry };
};

const pending = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
) =>
  vi.waitFor(async () => {
    const calls = (
      await harness.snapshot(BrowserCallsDoc, conversationId, context)
    )?.calls;
    expect(calls?.[toolCallId]?.status).toBe("pending");
  });

/** The browser's side: claim the issued call and finish it. */
const answer = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  output: BrowserCallResult["output"],
  metadata?: BrowserCallResult["metadata"],
) => {
  await pending(harness, conversationId, toolCallId);
  const claim = await claimBrowserCall(
    harness,
    conversationId,
    toolCallId,
    context,
  );
  if (claim === undefined) throw new Error(`${toolCallId} was not claimable.`);
  await finishBrowserCall(
    harness,
    {
      conversationId,
      toolCallId,
      toolName: claim.toolName,
      capability: claim.capability,
      canonicalInput: claim.input,
      output,
      metadata,
    },
    context,
  );
};

/** The panel's claim: a card may hold it unstarted; `started` says the page ran it. */
const claimAs = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  { started }: { readonly started: boolean },
) => {
  await pending(harness, conversationId, toolCallId);
  const outcome = await claimBrowserCallAs(
    harness,
    conversationId,
    toolCallId,
    tab,
    context,
  );
  if (outcome.status !== "claimed")
    throw new Error(`${toolCallId} was not claimable: ${outcome.status}.`);
  const { claim } = outcome;
  if (started)
    expect(
      await startBrowserCall(
        harness,
        conversationId,
        toolCallId,
        { capability: claim.capability, binding: claim.binding },
        context,
      ),
    ).toBe("started");
  return {
    conversationId,
    toolCallId,
    toolName: claim.toolName,
    capability: claim.capability,
    binding: claim.binding,
    canonicalInput: claim.input as JsonObject,
  };
};

const fail = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  disposition: BrowserCallFailureDisposition,
) => {
  const claimed = await claimAs(harness, conversationId, toolCallId, {
    started: disposition === "failed",
  });
  expect(
    await failBrowserCall(harness, { ...claimed, disposition }, context),
  ).toBe("failed");
};

const go = async (
  root: Conversation,
  content: string,
  browser: () => Promise<void> = async () => undefined,
) => {
  const submission = await root.submit({ type: "input", content }, context);
  await browser();
  expect((await submission.wait(context)).status).toBe("done");
};

const resultOf = async (root: Conversation, toolCallId: string) => {
  const { messages } = await root.context(context);
  const found = messages.find(
    (message): message is ToolResultMessage =>
      message.role === "toolResult" && message.toolCallId === toolCallId,
  );
  if (found === undefined) throw new Error(`No result for ${toolCallId}.`);
  return found;
};

const textOf = (message: ToolResultMessage) =>
  message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));

const recordOf = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
) =>
  (await harness.snapshot(BrowserCallsDoc, conversationId, context))?.calls[
    toolCallId
  ];

describe("the catalogue", () => {
  test("43 tools from the library's table, in order: the Petrinaut tools, the graph reads, then Save naming the document", () => {
    const definitions = hashBrowserToolDefinitions(documentId);
    expect(definitions.map(({ name }) => name)).toEqual([
      ...Object.keys(hashPetrinautTools),
      brunchTools.hashQueryEntities,
      brunchTools.hashQueryEntityTypes,
      brunchTools.hashQueryWebs,
      brunchTools.appSaveNet,
    ]);
    expect(definitions).toHaveLength(43);
    expect(definitions.at(-1)?.description).toBe(
      hashSaveDescription(documentId),
    );
    expect(hashBrowserToolDefinitions().at(-1)?.description).toBe(
      placeholderSaveDescription,
    );
    expect(
      createHashBrowserToolsExtension(createHostBinding()).tools?.map(
        ({ name }) => name,
      ),
    ).toEqual(definitions.slice(0, 42).map(({ name }) => name));
  });

  test("graph reads get 256 KiB with the line limit raised to match; the net tools keep theirs, Save Pi's default", () => {
    const tools = new Map(
      [
        ...(createHashBrowserToolsExtension(createHostBinding()).tools ?? []),
        ...(createHashSaveExtension(createHostBinding(), documentId).tools ??
          []),
      ].map((tool) => [tool.name, tool]),
    );
    expect(textToolOutputLimits).toEqual({
      maxBytes: 256 * 1024,
      maxLines: 256 * 1024,
    });
    for (const name of [
      brunchTools.hashQueryEntities,
      brunchTools.hashQueryEntityTypes,
      brunchTools.hashQueryWebs,
    ])
      expect(tools.get(name)?.outputLimits).toEqual(textToolOutputLimits);
    expect(tools.get("petrinaut_get_net")?.outputLimits).toEqual({
      maxBytes: 256 * 1024,
    });
    expect(tools.get("petrinaut_get_diagnostics")?.outputLimits).toBe(
      undefined,
    );
    expect(tools.get(brunchTools.appSaveNet)?.outputLimits).toBe(undefined);
  });
});

describe("validating HASH's inputs and the editor (§3.4)", () => {
  test("a call naming another editor is refused before freshness, even with no view, and records nothing", async () => {
    const { harness, root } = await open([
      call("petrinaut_create_place", "add-1", { ...place, editor_id: "other" }),
      fauxAssistantMessage("Wrong editor."),
    ]);
    try {
      await go(root, "Add a dryer.");
      const result = await resultOf(root, "add-1");
      expect(result.isError).toBe(true);
      expect(textOf(result)).toEqual([unknownEditorRefusal("other")]);
      expect(await recordOf(harness, root.id, "add-1")).toBeUndefined();
    } finally {
      await harness.close(context);
    }
  });

  test.each([
    [
      "an ad-hoc initial state",
      "petrinaut_create_scenario",
      {
        ...editor,
        id: "s1",
        name: "S",
        scenarioParameters: [],
        initialState: {
          type: "adhoc",
          content: { variables: [], netParameters: [], places: {} },
        },
      },
    ],
    [
      "an input-arc type on an output arc",
      "petrinaut_update_arc",
      {
        ...editor,
        transitionId: "t",
        arcDirection: "output",
        placeId: "p",
        type: "inhibitor",
      },
    ],
  ])(
    "%s, which Pi's JSON Schema check accepts and HASH's schema refuses, is an error and records nothing",
    async (_label, toolName, args) => {
      const { harness, root } = await open([
        call("petrinaut_get_net", "read-1", getNet),
        call(toolName, "bad-1", args),
        fauxAssistantMessage("Refused."),
      ]);
      try {
        await go(root, "Change it.", () =>
          answer(
            harness,
            root.id,
            "read-1",
            { title: "Net", definition: {} },
            { documentRevision: { before: "R1" } },
          ),
        );
        const result = await resultOf(root, "bad-1");
        expect(result.isError).toBe(true);
        // Not a Pi argument error: the tool's own parse refused it.
        expect(textOf(result).join("")).not.toContain(
          "Validation failed for tool",
        );
        expect(await recordOf(harness, root.id, "bad-1")).toBeUndefined();
      } finally {
        await harness.close(context);
      }
    },
  );

  test("a valid input naming the open editor is issued as its schema parses it, against the view's revision", async () => {
    const { harness, root } = await open([
      call("petrinaut_get_net", "read-1", getNet),
      call("petrinaut_create_place", "add-1", place),
      fauxAssistantMessage("Added."),
    ]);
    try {
      await go(root, "Add a dryer.", async () => {
        await answer(
          harness,
          root.id,
          "read-1",
          { title: "Net", definition: {} },
          { documentRevision: { before: "R1" } },
        );
        await answer(harness, root.id, "add-1", { applied: true });
      });
      expect(await recordOf(harness, root.id, "add-1")).toMatchObject({
        status: "settled",
        toolName: "petrinaut_create_place",
        // The schema turns the model's name for the place into its ID, as Brunch on Flue issues it.
        input: hashPetrinautTools.petrinaut_create_place.zInput.parse(place),
        expectedRevision: "R1",
      });
    } finally {
      await harness.close(context);
    }
  });
});

describe("HASH's no-view refusal (§3.5)", () => {
  test("a change with no read of the net in context is not started, and the model is told to read it with petrinaut_get_net", async () => {
    const { harness, root } = await open([
      call("petrinaut_create_place", "add-1", place),
      fauxAssistantMessage("I need to read the net."),
    ]);
    try {
      await go(root, "Add a dryer.");
      const result = await resultOf(root, "add-1");
      expect(result.isError).toBe(true);
      expect(textOf(result)).toEqual([hashNoNetViewRefusal]);
      expect(hashNoNetViewRefusal).not.toBe(noNetViewRefusal);
      expect(await recordOf(harness, root.id, "add-1")).toBeUndefined();
    } finally {
      await harness.close(context);
    }
  });
});

describe("app_save_net (§3.2)", () => {
  test("with no view of the net, a save is refused in HASH's words, without the unconfirmed note, and never issued", async () => {
    const { harness, root } = await open([
      call(brunchTools.appSaveNet, "s0", saveInput),
      fauxAssistantMessage("I need to read the net."),
    ]);
    try {
      await go(root, "Save it.");
      const result = await resultOf(root, "s0");
      expect(result.isError).toBe(true);
      expect(textOf(result)).toEqual([hashNoNetViewRefusal]);
      expect(await recordOf(harness, root.id, "s0")).toBeUndefined();
    } finally {
      await harness.close(context);
    }
  });

  /** Reads the net at R1, then saves; `settle` is the browser's side of the save. */
  const saveAfterRead = async (
    settle: (harness: Harness, conversationId: ConversationId) => Promise<void>,
  ) => {
    const opened = await open([
      call("petrinaut_get_net", "n1", getNet),
      call(brunchTools.appSaveNet, "s1", saveInput),
      fauxAssistantMessage("Done."),
    ]);
    const { harness, root } = opened;
    await go(root, "Save the net.", async () => {
      await answer(
        harness,
        root.id,
        "n1",
        { title: "Replenishment", definition: {}, extensions: {} },
        { documentRevision: { before: "r1" } },
      );
      await settle(harness, root.id);
    });
    const result = await resultOf(root, "s1");
    return { ...opened, result, text: textOf(result).join("") };
  };

  test("issued against the view's revision; the model sees { saved: true, … }, the UI the same, and it is no view", async () => {
    const { harness, root, result, text } = await saveAfterRead(
      (harness, conversationId) =>
        answer(harness, conversationId, "s1", {
          status: "saved",
          decisionTime: "2026-10-24T01:00:00.000Z",
          title: "Replenishment",
          stillDirty: true,
        }),
    );
    try {
      const saved = {
        saved: true,
        decisionTime: "2026-10-24T01:00:00.000Z",
        title: "Replenishment",
        stillDirty: true,
      };
      expect(result.isError).toBe(false);
      expect(JSON.parse(text)).toEqual(saved);
      expect(result.details).toEqual({
        brunchBrowserResult: true,
        output: saved,
      });
      expect(await recordOf(harness, root.id, "s1")).toMatchObject({
        input: saveInput,
        expectedRevision: "r1",
        // The record keeps the browser's own output.
        output: { status: "saved" },
      });
      const view = visibleNetView(await root.context(context));
      expect(view).toMatchObject({ state: "current", revision: "r1" });
      expect(
        view.state === "current" &&
          view.message.role === "toolResult" &&
          view.message.toolCallId,
      ).toBe("n1");
    } finally {
      await harness.close(context);
    }
  });

  test("unconfirmed: { saved: false, error, note }", async () => {
    const { harness, result, text } = await saveAfterRead(
      (harness, conversationId) =>
        answer(harness, conversationId, "s1", {
          status: "unconfirmed",
          error: "Failed to fetch",
        }),
    );
    await harness.close(context);
    expect(result.isError).toBe(false);
    expect(JSON.parse(text)).toEqual({
      saved: false,
      error: "Failed to fetch",
      note: hashSaveUnconfirmedNote,
    });
  });

  test("declined on the card, never started: a result, { saved: false, reason }", async () => {
    const reason = "The user declined this save; nothing was saved.";
    const { harness, result, text } = await saveAfterRead(
      async (harness, conversationId) => {
        const claimed = await claimAs(harness, conversationId, "s1", {
          started: false,
        });
        await finishBrowserCall(
          harness,
          {
            ...claimed,
            output: { status: "not-started", reason },
            metadata: { documentRevision: {} },
          },
          context,
        );
      },
    );
    await harness.close(context);
    expect(result.isError).toBe(false);
    expect(JSON.parse(text)).toEqual({ saved: false, reason });
  });

  test("refused as stale by the page: not started, without the note", async () => {
    const { harness, result, text } = await saveAfterRead(
      (harness, conversationId) => fail(harness, conversationId, "s1", "stale"),
    );
    await harness.close(context);
    expect(result.isError).toBe(true);
    expect(text).toContain(
      "Not started: the document changed by other means after your last view of the net.",
    );
    expect(text).not.toContain(hashSaveUnconfirmedNote);
  });

  test("lost after it started: the effect is unknown, with the note", async () => {
    const { harness, result, text } = await saveAfterRead(
      (harness, conversationId) =>
        fail(harness, conversationId, "s1", "failed"),
    );
    await harness.close(context);
    expect(result.isError).toBe(true);
    expect(text).toBe(
      `The browser result failed; an attempted document effect is unknown. ${hashSaveUnconfirmedNote}`,
    );
  });

  test("answered in an unknown shape: an error, with the note", async () => {
    const { harness, result, text } = await saveAfterRead(
      (harness, conversationId) =>
        answer(harness, conversationId, "s1", { saved: "maybe" }),
    );
    await harness.close(context);
    expect(result.isError).toBe(true);
    expect(text).toBe(
      `HASH's page returned a save in an unknown shape. ${hashSaveUnconfirmedNote}`,
    );
  });

  test("the factory under one extension name: the request after the bound Save is installed carries its description", async () => {
    const { harness, root, requests, host, registry } = await open([
      fauxAssistantMessage("Ready."),
      fauxAssistantMessage("Saved?"),
    ]);
    try {
      registry.install(createHashSaveExtension(host));
      await go(root, "Hello.");
      registry.install(createHashSaveExtension(host, "net-43"));
      await go(root, "Save it.");
      const saveDescription = (messages: readonly Message[]) =>
        getCurrentTools(messages).find(
          ({ name }) => name === brunchTools.appSaveNet,
        )?.description;
      expect(createHashSaveExtension(host).name).toBe(hashSaveExtensionName);
      expect(requests.map(saveDescription)).toEqual([
        placeholderSaveDescription,
        hashSaveDescription("net-43"),
      ]);
    } finally {
      await harness.close(context);
    }
  });
});

describe("graph reads (§3.3)", () => {
  const webId = "c0ffee00-0000-4000-8000-000000000000";
  const entityRead = {
    propertyTypes: [],
    entityTypes: [
      {
        entityTypeId: "https://hash.ai/@h/types/entity-type/person/v/1",
        title: "Person",
      },
    ],
    entities: [
      {
        entityId: `${webId}~e1`,
        label: "Ada",
        editionId: "ed-1",
        webId,
        entityTypeIds: ["https://hash.ai/@h/types/entity-type/person/v/1"],
        properties: {},
        draft: false,
        matched: true,
      },
    ],
  };

  test("the model reads the renderer's text exactly, details carry the same string, and a read beside a net read leaves the net read the view", async () => {
    const readInput = {
      entityIds: [`${webId}~e1`],
      fullValuesFor: [`${webId}~e1`],
    };
    const { harness, root } = await open([
      fauxAssistantMessage(
        [
          fauxToolCall("petrinaut_get_net", getNet, { id: "n1" }),
          fauxToolCall(brunchTools.hashQueryEntities, readInput, {
            id: "g1",
          }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Read both."),
    ]);
    try {
      await go(root, "Read.", async () => {
        await answer(
          harness,
          root.id,
          "n1",
          { title: "Net", definition: {} },
          { documentRevision: { before: "R1" } },
        );
        await answer(harness, root.id, "g1", entityRead, {
          documentRevision: { before: "R1" },
        });
      });
      const expected = hashEntityReadForModel(
        entityRead,
        readInput.fullValuesFor,
      );
      const result = await resultOf(root, "g1");
      expect(textOf(result)).toEqual([expected]);
      expect(result.details).toEqual({
        brunchBrowserResult: true,
        output: expected,
        metadata: { documentRevision: { before: "R1" } },
      });
      const view = await root.context(context);
      const latest = visibleNetView(view);
      expect(latest).toMatchObject({ state: "current", revision: "R1" });
      expect(
        latest.state === "current" &&
          latest.message.role === "toolResult" &&
          latest.message.toolCallId,
      ).toBe("n1");
      expect(pruneEdits(view)).toEqual([]);
    } finally {
      await harness.close(context);
    }
  });

  test("a failed read renders { error, note } as JSON", async () => {
    const { harness, root } = await open([
      call(brunchTools.hashQueryWebs, "g1"),
      fauxAssistantMessage("It failed."),
    ]);
    try {
      await go(root, "Read my webs.", () =>
        answer(harness, root.id, "g1", { error: "Graph unavailable." }),
      );
      expect(textOf(await resultOf(root, "g1"))).toEqual([
        JSON.stringify({
          error: "Graph unavailable.",
          note: "The read failed; the document is unchanged.",
        }),
      ]);
    } finally {
      await harness.close(context);
    }
  });

  test("a page of more than 2,000 lines reaches the model whole", async () => {
    const webs = {
      webs: Array.from({ length: 3000 }, (_, index) => ({
        webId: `web-${index}`,
        kind: "organization" as const,
        shortname: `org${index}`,
      })),
    };
    const expected = hashWebReadForModel(webs);
    expect(expected.split("\n").length).toBeGreaterThan(2000);
    const { harness, root } = await open([
      call(brunchTools.hashQueryWebs, "g1"),
      fauxAssistantMessage("Many webs."),
    ]);
    try {
      await go(root, "Read my webs.", () =>
        answer(harness, root.id, "g1", webs),
      );
      expect(textOf(await resultOf(root, "g1"))).toEqual([expected]);
    } finally {
      await harness.close(context);
    }
  });
});

describe("a declined removal (§3.7)", () => {
  test("settles as a result the model reads bare; the earlier view stays and its read-back is not pruned", async () => {
    const readBack = { places: [{ id: place.id, name: place.name }] };
    const { harness, root } = await open([
      call("petrinaut_get_net", "n1", getNet),
      call("petrinaut_create_place", "add-1", place),
      call("petrinaut_remove_place", "rm-1", { ...editor, placeId: place.id }),
      fauxAssistantMessage("You declined it."),
    ]);
    const declined = {
      applied: false,
      reason: "The user denied this destructive edit.",
    };
    try {
      await go(root, "Add a dryer, then remove it.", async () => {
        await answer(
          harness,
          root.id,
          "n1",
          { title: "Net", definition: {} },
          { documentRevision: { before: "R1" } },
        );
        await answer(
          harness,
          root.id,
          "add-1",
          { applied: true },
          { documentRevision: { before: "R1", after: "R2" }, readBack },
        );
        const claimed = await claimAs(harness, root.id, "rm-1", {
          started: false,
        });
        await finishBrowserCall(
          harness,
          { ...claimed, output: declined, metadata: { documentRevision: {} } },
          context,
        );
      });
      const result = await resultOf(root, "rm-1");
      expect(result.isError).toBe(false);
      expect(textOf(result)).toEqual([JSON.stringify(declined)]);
      const view = await root.context(context);
      const latest = visibleNetView(view);
      expect(latest).toMatchObject({
        state: "current",
        revision: "R2",
        kind: "read-back",
      });
      expect(
        latest.state === "current" &&
          latest.message.role === "toolResult" &&
          latest.message.toolCallId,
      ).toBe("add-1");
      expect(pruneEdits(view)).toEqual([]);
    } finally {
      await harness.close(context);
    }
  });
});

// ─── The output bound, through the real tool path ────────────────────────────

describe("the output bound on a change's read-back (H10)", () => {
  const changeOutput = { applied: true };
  const readBackOf = (padding: number) => ({
    places: [{ id: place.id }],
    padding: "x".repeat(padding),
  });
  /** A read-back whose rendered change result is exactly `bytes` long (ASCII). */
  const readBackRenderingTo = (bytes: number) => {
    const base = renderNetChange(changeOutput, readBackOf(0), "R2").length;
    return readBackOf(bytes - base);
  };

  test.each([
    ["over Pi's default 50 KiB", 60 * 1024, "complete"],
    ["exactly at 256 KiB", 256 * 1024, "complete"],
    ["one byte over 256 KiB", 256 * 1024 + 1, "cut"],
  ] as const)(
    "a read-back %s (%i bytes) arrives %s; a cut one is not a view, so the next change keeps the earlier read's revision",
    async (_name, bytes, arrives) => {
      const { models, model } = scriptedModel([
        call("petrinaut_get_net", "read", getNet),
        call("petrinaut_create_place", "big", place),
        call("petrinaut_create_place", "next", {
          ...place,
          id: "place-washer",
          name: "Washer",
        }),
        fauxAssistantMessage("Done."),
      ]);
      const host = createHostBinding();
      const tools = createHashBrowserToolsExtension(host);
      const registry = createRegistry();
      registry.install(browserCallExtension);
      registry.install(tools);
      const harness = await Harness.open(
        new MemoryStorage(),
        // The faux model's window is small: a 256 KiB result would compact.
        { models, registry, settings: { compaction: { enabled: false } } },
        context,
      );
      host.bind(harness);
      try {
        const root = await harness.root(context, {
          agent: { model, extensions: [tools] },
        });
        await harness.commit(
          (tx) => bindBrowserDocument(tx, root.id, binding),
          context,
        );
        const readBack = readBackRenderingTo(bytes);
        await go(root, "Add a dryer and a washer.", async () => {
          await answer(
            harness,
            root.id,
            "read",
            { title: "Net" },
            { documentRevision: { before: "R1" } },
          );
          await answer(harness, root.id, "big", changeOutput, {
            documentRevision: { before: "R1", after: "R2" },
            readBack,
          });
          await answer(harness, root.id, "next", changeOutput);
        });
        const texts = textOf(await resultOf(root, "big"));
        const rendered = renderNetChange(changeOutput, readBack, "R2");
        expect(rendered.length).toBe(bytes);
        expect({
          exact: texts.length === 1 && texts[0] === rendered,
          truncated: (texts.at(-1) ?? "").startsWith(
            "<harness>\n[warn] Output truncated",
          ),
          nextIssuedAgainst: (await recordOf(harness, root.id, "next"))
            ?.expectedRevision,
        }).toEqual(
          arrives === "complete"
            ? { exact: true, truncated: false, nextIssuedAgainst: "R2" }
            : { exact: false, truncated: true, nextIssuedAgainst: "R1" },
        );
      } finally {
        await harness.close(context);
      }
    },
  );
});
