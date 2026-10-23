/**
 * The patched Flue/Pi runtime contracts Brunch relies on, exercised through a
 * real in-process Flue runtime and agent loop with a scripted model: native
 * tool-schema authority, and model-only context projection with exact
 * compaction slices. No provider is called.
 */
import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  getCurrentTools,
  type JsonObject,
  type Message,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  type ContextProjectionEntry,
  defineTool,
  type ToolInputSchema,
  useContextProjection,
  useModel,
  useTool,
} from "@flue/runtime";
import { start } from "@flue/runtime/node";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient, type FlueConversationSnapshot } from "@flue/sdk";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  brunchTools,
  draftPetrinautExperimentInputSchema,
} from "@hashintel/brunch-agent";
import { toPetrinautId } from "@hashintel/petrinaut-core";

import { createBrunchContextProjection } from "../src/shared/context-projection.ts";
import { createDraftExperimentTool } from "../src/shared/petrinaut-tools/draft-experiment.ts";
import { browserResultEnvelope } from "../src/shared/petrinaut-tools/petrinaut-construction.ts";

type Step = (context: TranscriptContext) => AssistantMessage;

// The faux provider estimates usage from the prompt; the small window lets a
// long user message overflow on an otherwise successful reply.
const faux = fauxProvider({
  provider: "faux",
  models: [{ id: "faux-1" }, { id: "faux-small", contextWindow: 1_000 }],
});
const modelSpecifier = "faux/faux-1";
const smallModelSpecifier = "faux/faux-small";

/** Every request the model received, with the scripted reply it produced. */
const requests: { context: TranscriptContext; summary: boolean }[] = [];
const steps: Step[] = [];
/** Projector invocations, counted when each summary request arrives. */
const projectorCalls: (readonly ContextProjectionEntry[])[] = [];
const projectorCallsAtSummary: number[] = [];

faux.setResponses(
  Array.from({ length: 80 }, () => (context: TranscriptContext) => {
    // Tool declarations travel in transcript system messages; the
    // summarization request declares none.
    const summary = getCurrentTools(context.messages).length === 0;
    requests.push({ context: structuredClone(context), summary });
    if (summary) {
      projectorCallsAtSummary.push(projectorCalls.length);
      return fauxAssistantMessage("Summary: an earlier guide read.");
    }
    const step = steps.shift();
    if (!step) throw new Error("The script ran out of scripted agent steps.");
    return step(context);
  }),
);

const call = (id: string, name: string, args: JsonObject) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const reply = (text: string) => () => fauxAssistantMessage([fauxText(text)]);

const toolResult = (context: TranscriptContext, toolCallId: string) =>
  context.messages.find(
    (message): message is Extract<Message, { role: "toolResult" }> =>
      message.role === "toolResult" && message.toolCallId === toolCallId,
  );
const resultText = (context: TranscriptContext, toolCallId: string) =>
  toolResult(context, toolCallId)
    ?.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

// --- Native schema authority -------------------------------------------------

const browserCalls: { toolName: string; input: unknown }[] = [];
let validations = 0;
/** The draft schema, counting each authoritative validation. */
const countedDraftSchema = {
  "~standard": {
    ...draftPetrinautExperimentInputSchema["~standard"],
    validate: (value: unknown) => {
      validations += 1;
      return draftPetrinautExperimentInputSchema["~standard"].validate(value);
    },
  },
} as unknown as typeof draftPetrinautExperimentInputSchema;

let pendingRuns = 0;
const neverSettles: ToolInputSchema = {
  "~standard": {
    version: 1,
    vendor: "brunch-test",
    validate: () => new Promise(() => {}),
    jsonSchema: {
      input: () => ({ type: "object", properties: {} }),
      output: () => ({ type: "object", properties: {} }),
    },
  },
};
const emptyObject: ToolInputSchema = {
  "~standard": {
    version: 1,
    vendor: "brunch-test",
    validate: (value: unknown) => ({ value }),
    jsonSchema: {
      input: () => ({ type: "object", properties: {} }),
      output: () => ({ type: "object", properties: {} }),
    },
  },
};
const boundedRun: { aborted?: boolean; reason?: string } = {};

/** A provider declaration using references and closed objects. */
const referencedDeclaration = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { place: { $ref: "#/$defs/place" } },
  required: ["place"],
  additionalProperties: false,
  $defs: {
    place: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
};
const referencedInput: ToolInputSchema = {
  "~standard": {
    version: 1,
    vendor: "brunch-test",
    validate: (value: unknown) => ({ value }),
    jsonSchema: {
      input: () => structuredClone(referencedDeclaration),
      output: () => structuredClone(referencedDeclaration),
    },
  },
};

/** An asynchronous native validator the test settles after cancelling. */
let settleValidation: (() => void) | undefined;
let validationEntered: (() => void) | undefined;
let cancelledRuns = 0;
const slowInput: ToolInputSchema = {
  "~standard": {
    version: 1,
    vendor: "brunch-test",
    validate: async (value: unknown) => {
      validationEntered?.();
      await new Promise<void>((resolve) => {
        settleValidation = resolve;
      });
      return { value };
    },
    jsonSchema: {
      input: () => ({ type: "object", properties: {} }),
      output: () => ({ type: "object", properties: {} }),
    },
  },
};

// Tools that record what ran are defined once, outside the agent's render.
const pendingValidationTool = defineTool({
  name: "pending_validation",
  description: "A native validator that never settles.",
  input: neverSettles,
  timeoutMs: 50,
  run: () => {
    pendingRuns += 1;
    return { output: "ran" };
  },
});
const boundedRunTool = defineTool({
  name: "bounded_run",
  description: "A natively validated run that outlives its bound.",
  input: emptyObject,
  timeoutMs: 50,
  run: async ({ signal }) => {
    await new Promise<void>((resolve) => {
      signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    boundedRun.aborted = signal?.aborted;
    boundedRun.reason = (signal?.reason as Error | undefined)?.name;
    return { output: "late" };
  },
});
const slowValidationTool = defineTool({
  name: "slow_validation",
  description:
    "A native validator still running when the submission is cancelled.",
  input: slowInput,
  run: () => {
    cancelledRuns += 1;
    return { output: "ran" };
  },
});

function NativeContractAgent() {
  useModel(modelSpecifier);
  useTool(
    createDraftExperimentTool({
      authorizeDraft: async () => {},
      executeBrowserTool: async ({ toolName, input }) => {
        browserCalls.push({ toolName, input });
        return { output: { status: "drafted", summary: "", diagnostics: [] } };
      },
    }),
  );
  useTool(
    defineTool({
      name: "counted_draft",
      description: "Validate one draft with the counted native schema.",
      input: countedDraftSchema,
      run: ({ data }) => ({
        output: { blocksRun: data.unsupported[0]?.blocksRun ?? null },
      }),
    }),
  );
  useTool(pendingValidationTool);
  useTool(boundedRunTool);
  useTool(
    defineTool({
      name: "referenced_input",
      description: "A native input declared with references.",
      input: referencedInput,
      run: () => ({ output: "ok" }),
    }),
  );
  useTool(slowValidationTool);
  return "Native schema contract agent.";
}
NativeContractAgent.agentName = "native-contract";

// --- Context projection ------------------------------------------------------

const instructions = "Projection contract agent.";
const sidecar = { observation: { binding: "private-binding" } };

function ProjectionContractAgent() {
  useModel(smallModelSpecifier, {
    compaction: { reserveTokens: 1, keepRecentTokens: 1 },
  });
  useContextProjection(
    createBrunchContextProjection({
      observe: (entries) => projectorCalls.push(entries),
    }),
  );
  useTool(
    defineTool({
      name: "readPetrinautDoc",
      description: "Read the Petrinaut guide.",
      input: emptyObject,
      run: () => ({
        output: browserResultEnvelope({
          output: "Petrinaut guide",
          metadata: sidecar,
        }),
      }),
    }),
  );
  // A document change carrying its read-back, and a later net read that makes
  // the read-back redundant: Brunch's projection depends on which entries it sees.
  useTool(
    defineTool({
      name: "addPlace",
      description: "Add a place.",
      input: emptyObject,
      run: () => ({
        output: browserResultEnvelope({
          output: "added",
          metadata: {
            ...sidecar,
            documentRevision: { before: "r1", after: "r2" },
            readBack: { places: ["queue-readback"] },
          },
        }),
      }),
    }),
  );
  useTool(
    defineTool({
      name: "getLatestNetDefinition",
      description: "Read the net.",
      input: emptyObject,
      run: () => ({
        output: browserResultEnvelope({
          // Large enough that the reply after it overflows the small window.
          output: { places: "Places hold tokens. ".repeat(400) },
          metadata: { ...sidecar, documentRevision: { before: "r2" } },
        }),
      }),
    }),
  );
  return instructions;
}
ProjectionContractAgent.agentName = "projection-contract";

/** Holds a tool batch open so a second message joins at its turn boundary. */
let releaseHold: (() => void) | undefined;
let holdEntered: (() => void) | undefined;
function JoinContractAgent() {
  useModel(modelSpecifier);
  useContextProjection(createBrunchContextProjection());
  useTool(
    defineTool({
      name: "hold",
      description: "Hold the turn open.",
      input: emptyObject,
      run: async () => {
        holdEntered?.();
        await new Promise<void>((resolve) => {
          releaseHold = resolve;
        });
        return { output: "held" };
      },
    }),
  );
  return "Join contract agent.";
}
JoinContractAgent.agentName = "join-contract";

/** A tool whose run changes the next render's instructions and tools. */
let resourcesChanged = false;
const changeResourcesTool = defineTool({
  name: "change_resources",
  description: "Change the agent's resources.",
  input: emptyObject,
  run: () => {
    resourcesChanged = true;
    return { output: "changed" };
  },
});
function ResourceContractAgent() {
  useModel(modelSpecifier);
  useContextProjection(createBrunchContextProjection());
  useTool(changeResourcesTool);
  if (resourcesChanged)
    useTool(
      defineTool({
        name: "added_tool",
        description: "Available after the change.",
        input: emptyObject,
        run: () => ({ output: "added" }),
      }),
    );
  return resourcesChanged ? "Resources after." : "Resources before.";
}
ResourceContractAgent.agentName = "resource-contract";

let stopRuntime: () => Promise<void> = async () => {};
beforeAll(async () => {
  const flue = await start({
    agents: [
      NativeContractAgent,
      ProjectionContractAgent,
      JoinContractAgent,
      ResourceContractAgent,
    ],
    providers: [faux.provider],
  });
  stopRuntime = () => flue.stop();
});
afterAll(async () => {
  await stopRuntime();
});

const conversation = (agent: Parameters<typeof createAgentRouter>[0]) => {
  const router = createAgentRouter(agent);
  const client = createFlueClient({
    url: `http://flue.test/${crypto.randomUUID()}`,
    fetch: async (input, init) =>
      router.fetch(input instanceof Request ? input : new Request(input, init)),
  });
  return {
    client,
    speak: async (body: string) => {
      await client.wait(await client.send({ message: { kind: "user", body } }));
    },
  };
};

type FluePart = FlueConversationSnapshot["messages"][number]["parts"][number];
const toolPart = (snapshot: FlueConversationSnapshot, toolCallId: string) =>
  snapshot.messages
    .flatMap((message) => message.parts)
    .find(
      (part): part is Extract<FluePart, { type: "dynamic-tool" }> =>
        part.type === "dynamic-tool" && part.toolCallId === toolCallId,
    );

const experiment = {
  name: "Vans on the parcel route",
  scenarioId: "scenario-peak",
  scenarioParameterValues: {
    vans: { mode: "range" as const, min: 2, max: 8 },
  },
  runCount: 40,
  seed: 7,
  dt: 0.5,
  maxTime: 120,
  metricIds: ["metric-wait", "metric-late"],
  execution: {
    mode: "optimize" as const,
    objectiveMetricId: "metric-wait",
    direction: "minimize" as const,
    steps: 10,
    runsPerStep: 4,
  },
};
const draft = (
  patch: { experiment?: Record<string, unknown>; reportedBy?: string } = {},
) => ({
  experiment: { ...experiment, ...patch.experiment },
  declarations: [{ subject: "maxTime", statement: "120 model minutes." }],
  unsupported: [
    {
      condition: "No parcel may wait more than 30 minutes.",
      reason: "The request carries no constraints.",
      reportedByMetricId: patch.reportedBy ?? "metric-late",
    },
  ],
});

describe("native tool schemas through the Flue/Pi tool loop", () => {
  test("execution receives the native parse once, with defaults, while history keeps the raw call", async () => {
    const { client, speak } = conversation(NativeContractAgent);
    browserCalls.length = 0;
    validations = 0;
    const raw = draft();
    steps.push(
      () =>
        fauxAssistantMessage(
          [
            fauxToolCall(brunchTools.draftPetrinautExperiment, raw, {
              id: "draft-valid",
            }),
            fauxToolCall("counted_draft", raw, { id: "counted" }),
          ],
          { stopReason: "toolUse" },
        ),
      reply("Drafted."),
    );
    await speak("Draft the van experiment.");

    expect(browserCalls).toHaveLength(1);
    const executed = browserCalls[0]?.input as ReturnType<typeof draft>;
    expect(executed.unsupported[0]).toMatchObject({
      blocksRun: true,
      reportedByMetricId: toPetrinautId("metric-late"),
    });
    expect(validations).toBe(1);
    const history = await client.history();
    expect(toolPart(history, "counted")).toMatchObject({
      state: "output-available",
      output: { blocksRun: true },
    });
    const recorded = toolPart(history, "draft-valid");
    expect(recorded).toMatchObject({ state: "output-available", input: raw });
    expect(JSON.stringify(recorded?.input)).not.toContain("blocksRun");
  });

  test("a refinement or an uncoerced type rejects the call before the browser sees it", async () => {
    const { client, speak } = conversation(NativeContractAgent);
    browserCalls.length = 0;
    steps.push(
      () =>
        fauxAssistantMessage(
          [
            fauxToolCall(
              brunchTools.draftPetrinautExperiment,
              draft({ reportedBy: "metric-unlisted" }),
              { id: "draft-refined" },
            ),
            fauxToolCall(
              brunchTools.draftPetrinautExperiment,
              draft({ experiment: { runCount: "40" } }),
              { id: "draft-string" },
            ),
          ],
          { stopReason: "toolUse" },
        ),
      (context) =>
        fauxAssistantMessage(
          [
            fauxText(
              JSON.stringify({
                refined: toolResult(context, "draft-refined")?.isError,
                string: toolResult(context, "draft-string")?.isError,
              }),
            ),
          ],
          {},
        ),
    );
    await speak("Draft two invalid experiments.");

    expect(browserCalls).toHaveLength(0);
    const history = await client.history();
    expect(toolPart(history, "draft-refined")).toMatchObject({
      state: "output-error",
    });
    expect(
      (toolPart(history, "draft-refined") as { errorText?: string }).errorText,
    ).toContain("A reporting metric must be included in experiment.metricIds.");
    expect(toolPart(history, "draft-string")).toMatchObject({
      state: "output-error",
    });
  });

  test("an unsettled native validation is abandoned at the tool's bound, before execution", async () => {
    const { client, speak } = conversation(NativeContractAgent);
    pendingRuns = 0;
    steps.push(() => call("pending", "pending_validation", {}), reply("Done."));
    await speak("Validate forever.");

    expect(pendingRuns).toBe(0);
    const part = toolPart(await client.history(), "pending");
    expect(part).toMatchObject({ state: "output-error" });
    expect((part as { errorText?: string }).errorText).toContain(
      'Tool "pending_validation" timed out after 50ms',
    );
  });

  test("a natively parsed run still receives the tool's bounded signal", async () => {
    const { client, speak } = conversation(NativeContractAgent);
    steps.push(() => call("bounded", "bounded_run", {}), reply("Done."));
    await speak("Run past the bound.");

    expect(boundedRun).toEqual({ aborted: true, reason: "TimeoutError" });
    const part = toolPart(await client.history(), "bounded");
    expect((part as { errorText?: string }).errorText).toContain(
      'Tool "bounded_run" timed out after 50ms',
    );
  });

  test("the provider receives each native input declaration exactly as exported", async () => {
    const { speak } = conversation(NativeContractAgent);
    steps.push(reply("Ready."));
    await speak("Show your tools.");
    const [lead] = requests.at(-1)?.context.messages ?? [];
    const declarations = lead?.role === "system" ? (lead.toolsAdded ?? []) : [];
    const declared = (name: string) =>
      declarations.find((tool) => tool.name === name)?.parameters;
    expect(declared("referenced_input")).toEqual(referencedDeclaration);
    expect(declared(brunchTools.draftPetrinautExperiment)).toEqual(
      draftPetrinautExperimentInputSchema["~standard"].jsonSchema.input({
        target: "draft-2020-12",
      }),
    );
  });

  test("cancelling the submission during asynchronous native validation prevents execution", async () => {
    const { client } = conversation(NativeContractAgent);
    cancelledRuns = 0;
    const entered = new Promise<void>((resolve) => {
      validationEntered = resolve;
    });
    steps.push(
      () => call("slow", "slow_validation", {}),
      reply("Unreachable."),
    );
    const receipt = await client.send({
      message: { kind: "user", body: "Validate slowly." },
    });
    await entered;
    await client.abort();
    await expect(client.wait(receipt)).rejects.toThrow(/abort/iu);
    settleValidation?.();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cancelledRuns).toBe(0);
    steps.length = 0;
  });

  test("an agent without a projection sends its tool results unchanged", async () => {
    const { speak } = conversation(NativeContractAgent);
    let sent: string | undefined;
    steps.push(
      () =>
        call("draft-raw", brunchTools.draftPetrinautExperiment, {
          ...draft(),
        }),
      (context) => {
        sent = resultText(context, "draft-raw");
        return fauxAssistantMessage([fauxText("Seen.")]);
      },
    );
    await speak("Draft once more.");
    expect(sent).toContain("brunchBrowserResult");
  });
});

describe("model-only context projection", () => {
  test("projects every model request, keeps the leading system message and leaves history canonical", async () => {
    const { client, speak } = conversation(ProjectionContractAgent);
    const firstRequest = requests.length;
    projectorCalls.length = 0;
    let inRunResult: string | undefined;
    steps.push(
      () => call("doc-1", "readPetrinautDoc", {}),
      (context) => {
        inRunResult = resultText(context, "doc-1");
        return fauxAssistantMessage([fauxText("Read.")]);
      },
    );
    await speak("Read the guide.");

    // The continuation after the tool batch already sees the projection.
    expect(inRunResult).toBe(JSON.stringify("Petrinaut guide"));
    const agentRequests = requests
      .slice(firstRequest)
      .filter(({ summary }) => !summary);
    expect(agentRequests.length).toBe(2);
    for (const { context } of agentRequests) {
      const [lead] = context.messages;
      expect(lead?.role).toBe("system");
      if (lead?.role !== "system") continue;
      expect(JSON.stringify(lead.content)).toContain(instructions);
      expect(lead.toolsAdded?.map(({ name }) => name)).toContain(
        "readPetrinautDoc",
      );
      expect(JSON.stringify(context.messages)).not.toContain("private-binding");
    }
    for (const entries of projectorCalls)
      // The leading transcript system message is not a canonical entry.
      expect(
        entries.every(({ message }) => (message.role as string) !== "system"),
      ).toBe(true);

    const recorded = toolPart(await client.history(), "doc-1");
    expect(JSON.stringify(recorded?.output)).toContain("private-binding");
    expect(JSON.stringify(recorded?.output)).toContain("brunchBrowserResult");
  });

  test("a message joined at the turn boundary reaches the model once, as a reopened context has it", async () => {
    const requestStart = requests.length;
    const { client, speak } = conversation(JoinContractAgent);
    const entered = new Promise<void>((resolve) => {
      holdEntered = resolve;
    });
    steps.push(
      () => call("hold-1", "hold", {}),
      reply("Done."),
      reply("Done again."),
    );
    const first = await client.send({
      message: { kind: "user", body: "FIRST" },
    });
    await entered;
    const joined = await client.send({
      message: { kind: "user", body: "SECOND-JOINED" },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseHold?.();
    await client.wait(first);
    await client.wait(joined);
    steps.length = 0;

    // A late, separate submission would need a third request and would not
    // exercise the steering insertion at the held tool boundary.
    const joinedRequests = requests.slice(requestStart);
    expect(joinedRequests).toHaveLength(2);
    const live = joinedRequests[1]?.context.messages ?? [];
    expect(
      live.some(
        (message) =>
          message.role === "toolResult" && message.toolCallId === "hold-1",
      ),
    ).toBe(true);
    const joinedCopies = (messages: readonly Message[]) =>
      messages.filter(
        (message) =>
          message.role === "user" &&
          JSON.stringify(message.content).includes("SECOND-JOINED"),
      ).length;
    expect(joinedCopies(live)).toBe(1);
    expect(live[0]?.role).toBe("system");

    steps.push(reply("Reopened."));
    await speak("THIRD");
    const reopened = requests.at(-1)?.context.messages ?? [];
    expect(reopened.slice(0, live.length)).toEqual(live);
  });

  test("resource and instruction narration reaches the model once, as a reopened context has it", async () => {
    const { speak } = conversation(ResourceContractAgent);
    resourcesChanged = false;
    steps.push(
      () => call("change-1", "change_resources", {}),
      reply("Changed."),
    );
    await speak("Change your resources.");

    const live = requests.at(-1)?.context.messages ?? [];
    const signals = (type: string) =>
      live.filter(
        (message) =>
          message.role === "user" &&
          JSON.stringify(message.content).includes(
            `<signal type=\\"${type}\\"`,
          ),
      ).length;
    expect(signals("instructions")).toBe(1);
    expect(signals("resources")).toBe(1);
    const tools = getCurrentTools(live).map(({ name }) => name);
    expect(tools).toContain("added_tool");
    expect(tools.filter((name) => name === "added_tool")).toHaveLength(1);

    steps.push(reply("Reopened."));
    await speak("Again.");
    const reopened = requests.at(-1)?.context.messages ?? [];
    expect(reopened.slice(0, live.length)).toEqual(live);
  });

  test("compaction projects the summarized and turn-prefix slices from only their own entries", async () => {
    const { client, speak } = conversation(ProjectionContractAgent);
    projectorCalls.length = 0;
    projectorCallsAtSummary.length = 0;
    const firstRequest = requests.length;
    let afterChange: string | undefined;
    let afterRead: string | undefined;
    steps.push(
      () => call("add-1", "addPlace", {}),
      (context) => {
        afterChange = resultText(context, "add-1");
        return fauxAssistantMessage([fauxText("Added.")]);
      },
    );
    await speak("Add a queue.");
    steps.push(
      () => call("read-1", "getLatestNetDefinition", {}),
      (context) => {
        afterRead = resultText(context, "add-1");
        return fauxAssistantMessage([fauxText("Read.")]);
      },
    );
    await speak("Read the net.");

    // The whole context shows the change's read-back only until a later read.
    expect(afterChange).toContain("queue-readback");
    expect(afterRead).toBe(JSON.stringify("added"));
    // Four agent requests, then summarization only: the successful reply
    // that overflowed is compacted after, never re-requested.
    const turnRequests = requests.slice(firstRequest);
    expect(turnRequests.slice(0, 4).map(({ summary }) => summary)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(turnRequests.length).toBeGreaterThan(4);
    expect(turnRequests.slice(4).every(({ summary }) => summary)).toBe(true);
    const atSummary = projectorCallsAtSummary[0];
    expect(atSummary).toBeDefined();
    // Planning projects the whole context; the summary and turn-prefix inputs
    // are then projected from exactly their own canonical slices.
    const [wholeEntries, summarizedEntries, prefixEntries] = projectorCalls
      .slice(0, atSummary)
      .slice(-3);
    const ids = (entries: readonly ContextProjectionEntry[] | undefined) =>
      entries?.map(({ id }) => id) ?? [];
    const whole = ids(wholeEntries);
    const summarized = ids(summarizedEntries);
    const prefix = ids(prefixEntries);
    expect(summarized.length).toBeGreaterThan(0);
    // The reply overflowed after the read, inside its turn: a split turn.
    expect(prefix.length).toBeGreaterThan(0);
    expect(summarized).toEqual(whole.slice(0, summarized.length));
    expect(prefix).toEqual(
      whole.slice(summarized.length, summarized.length + prefix.length),
    );
    expect(summarized.length + prefix.length).toBeLessThan(whole.length);

    // The summarized slice ends before the read, so its own projection keeps
    // the change's read-back that the whole context had already dropped.
    const changeResultId = wholeEntries?.find(
      ({ message }) =>
        message.role === "toolResult" && message.toolCallId === "add-1",
    )?.id;
    expect(changeResultId).toBeDefined();
    expect(summarized).toContain(changeResultId);
    const summaryPrompt = JSON.stringify(
      turnRequests.slice(4).map(({ context }) => context.messages),
    );
    expect(summaryPrompt).toContain("queue-readback");
    expect(summaryPrompt).not.toContain("private-binding");
    expect(summaryPrompt).not.toContain("brunchBrowserResult");

    // A second compaction: the next request leads with the system message,
    // then the earlier summary, which is not re-summarized as an entry.
    const secondTurn = requests.length;
    const secondAt = projectorCallsAtSummary.length;
    steps.push(
      () => call("read-2", "getLatestNetDefinition", {}),
      reply("Read again."),
    );
    await speak("Read the net again.");
    const next = requests[secondTurn]?.context.messages ?? [];
    expect(next[0]?.role).toBe("system");
    expect(JSON.stringify(next[1])).toContain(
      "Summary: an earlier guide read.",
    );
    const atSecond = projectorCallsAtSummary[secondAt];
    expect(atSecond).toBeDefined();
    const [secondWhole, secondSummarized, secondPrefix] = projectorCalls
      .slice(0, atSecond)
      .slice(-3)
      .map(ids);
    const summaryEntryId = secondWhole?.[0];
    expect(secondSummarized?.length).toBeGreaterThan(0);
    expect(secondSummarized).not.toContain(summaryEntryId);
    expect(secondSummarized).toEqual(
      secondWhole?.slice(1, 1 + (secondSummarized?.length ?? 0)),
    );
    expect(secondPrefix).toEqual(
      secondWhole?.slice(
        1 + (secondSummarized?.length ?? 0),
        1 + (secondSummarized?.length ?? 0) + (secondPrefix?.length ?? 0),
      ),
    );

    const recorded = toolPart(await client.history(), "add-1");
    expect(JSON.stringify(recorded?.output)).toContain("private-binding");
    expect(JSON.stringify(recorded?.output)).toContain("queue-readback");
  });
});
