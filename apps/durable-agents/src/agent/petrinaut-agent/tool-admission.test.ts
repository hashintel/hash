import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
  createRegistry,
  defineExtension,
  defineTool,
  type Extension,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { describe, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../../test/scripted-model";
import {
  browserCallExtension,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "../../browser-call/browser-call";
import { petrinautBrowserToolsExtension } from "../../browser-call/petrinaut-browser-tools";
import { ledgerExtension } from "../../ledger";
import { admissionRefusal, toolAdmissionExtension } from "./tool-admission";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;

const ledgerEntries = [
  [
    "entity/create",
    { name: "Dryer", kind: "resource", origin: "stated", status: "confirmed" },
  ],
];

const placeInput = {
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

/** Server tools that count their runs: one outside Brunch's mixed list, and a stand-in `ledger_compile`. */
const createServerTools = () => {
  const ran: string[] = [];
  const counted = (name: string) =>
    defineTool({
      name,
      description: `Test tool ${name}.`,
      parameters: obj({}),
      execute: async () => {
        ran.push(name);
        return { output: [{ type: "text", text: "ran" }] };
      },
    });
  const extension = defineExtension({
    name: "test.server-tools",
    tools: [counted("server_probe"), counted(brunchTools.ledgerCompile)],
  });
  return { ran, extension };
};

const openConversation = async (responses: FauxResponseStep[]) => {
  const { models, model } = scriptedModel(responses);
  const server = createServerTools();
  const selected: Extension[] = [
    ledgerExtension,
    petrinautBrowserToolsExtension,
    server.extension,
    toolAdmissionExtension,
  ];
  const registry = createRegistry();
  for (const extension of [...selected, browserCallExtension])
    registry.install(extension);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  const root = await harness.root(context, {
    agent: { model, extensions: selected },
  });
  return { harness, root, ran: server.ran };
};

/** Each tool result in the transcript, by call ID. */
const resultsOf = async (root: Conversation) =>
  Object.fromEntries(
    (await root.entries({ order: "ascending" }, 100, undefined, context)).items
      .flatMap(({ model: messages = [] }) => messages)
      .flatMap((message) =>
        message.role === "toolResult"
          ? [
              [
                message.toolCallId,
                {
                  isError: message.isError,
                  text: message.content
                    .flatMap((part) =>
                      part.type === "text" ? [part.text] : [],
                    )
                    .join(""),
                },
              ] as const,
            ]
          : [],
      ),
  );

describe("the admission rules", () => {
  test("a mixed response refuses only server calls outside Brunch's mixed list", () => {
    const response = ["addPlace", brunchTools.ledgerCommit, "server_probe"];
    expect(admissionRefusal("server_probe", response)).toMatch(
      /^Mixed browser\/server call refused: server_probe /,
    );
    expect(admissionRefusal("addPlace", response)).toBeUndefined();
    expect(
      admissionRefusal(brunchTools.ledgerCommit, response),
    ).toBeUndefined();
    expect(
      admissionRefusal("server_probe", [
        brunchTools.ledgerCommit,
        "server_probe",
      ]),
    ).toBeUndefined();
  });

  test("a dependent call is refused beside any of its dependencies", () => {
    expect(
      admissionRefusal(brunchTools.queryBasis, [
        "readNetOutline",
        brunchTools.queryBasis,
      ]),
    ).toBe(
      "Dependent call refused: query_basis reads the result of readNetOutline. Call readNetOutline first, then query_basis after its result returns.",
    );
    expect(
      admissionRefusal(brunchTools.draftPetrinautExperiment, [
        "getLatestNetDefinition",
        brunchTools.draftPetrinautExperiment,
      ]),
    ).toMatch(/^Dependent call refused/);
    expect(
      admissionRefusal(brunchTools.queryBasis, [brunchTools.queryBasis]),
    ).toBeUndefined();
    expect(
      admissionRefusal("readNetOutline", [
        "readNetOutline",
        brunchTools.queryBasis,
      ]),
    ).toBeUndefined();
  });
});

describe("admission on a Harness", () => {
  test("a mixed response blocks the offending call and runs the others", async () => {
    const { harness, root, ran } = await openConversation([
      fauxAssistantMessage(
        [
          fauxToolCall("addPlace", placeInput, { id: "place" }),
          fauxToolCall(
            brunchTools.ledgerCommit,
            { entries: ledgerEntries },
            { id: "commit" },
          ),
          fauxToolCall("server_probe", {}, { id: "probe" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Done."),
    ]);
    try {
      const submission = await root.submit(
        { type: "input", content: "Add a dryer." },
        context,
      );
      await vi.waitFor(async () => {
        const calls = (
          await harness.snapshot(BrowserCallsDoc, root.id, context)
        )?.calls;
        expect(calls?.place).toBeDefined();
      });
      const claim = await claimBrowserCall(harness, root.id, "place", context);
      expect(claim).toBeDefined();
      await finishBrowserCall(
        harness,
        {
          conversationId: root.id,
          toolCallId: "place",
          toolName: "addPlace",
          capability: claim!.capability,
          canonicalInput: claim!.input,
          output: { id: "place-dryer" },
        },
        context,
      );
      expect((await submission.wait(context)).status).toBe("done");
      const results = await resultsOf(root);
      expect(results.place).toEqual({
        isError: false,
        text: JSON.stringify({ id: "place-dryer" }),
      });
      expect(results.commit?.isError).toBe(false);
      expect(results.probe?.isError).toBe(true);
      expect(results.probe?.text).toContain(
        "Mixed browser/server call refused: server_probe",
      );
      expect(ran).toEqual([]);
    } finally {
      await harness.close(context);
    }
  });

  test("a dependent pair in one response blocks the dependent call", async () => {
    const { harness, root, ran } = await openConversation([
      fauxAssistantMessage(
        [
          fauxToolCall(
            brunchTools.ledgerCommit,
            { entries: ledgerEntries },
            { id: "commit" },
          ),
          fauxToolCall(brunchTools.ledgerCompile, {}, { id: "compile" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Done."),
    ]);
    try {
      const submission = await root.submit(
        { type: "input", content: "We have one dryer." },
        context,
      );
      expect((await submission.wait(context)).status).toBe("done");
      const results = await resultsOf(root);
      expect(results.commit?.isError).toBe(false);
      expect(results.compile?.isError).toBe(true);
      expect(results.compile?.text).toContain(
        "Dependent call refused: ledger_compile reads the result of ledger_commit. Call ledger_commit first, then ledger_compile after its result returns.",
      );
      expect(ran).toEqual([]);
    } finally {
      await harness.close(context);
    }
  });

  test("the same pair across two rounds runs", async () => {
    const { harness, root, ran } = await openConversation([
      fauxAssistantMessage(
        fauxToolCall(
          brunchTools.ledgerCommit,
          { entries: ledgerEntries },
          { id: "commit" },
        ),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        fauxToolCall(brunchTools.ledgerCompile, {}, { id: "compile" }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Done."),
    ]);
    try {
      const submission = await root.submit(
        { type: "input", content: "We have one dryer." },
        context,
      );
      expect((await submission.wait(context)).status).toBe("done");
      const results = await resultsOf(root);
      expect(results.commit?.isError).toBe(false);
      expect(results.compile).toEqual({ isError: false, text: "ran" });
      expect(ran).toEqual([brunchTools.ledgerCompile]);
    } finally {
      await harness.close(context);
    }
  });
});
