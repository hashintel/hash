import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  conversationConstructionMode,
  deriveMutationEffects,
  readPetrinautNetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolResultSignal } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { createHeadlessPetrinautClient } from "../src/evaluations/runbook/headless-petrinaut-client.ts";

import type { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";
import type { Context, FauxProviderHandle } from "@earendil-works/pi-ai";
import type { FlueConversationSnapshot } from "@flue/sdk";
import type {
  BrowserBinding,
  ConstructionMutationAttempt,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import type { SDCPN } from "@hashintel/petrinaut-core";

export const retentionQuotes = [
  "When final inspection starts, reserve one available crew until sign-off.",
  "At sign-off, verify that the reserved crew is still available.",
] as const;
export const retentionSource = `TEST synthetic original testimony control: ${retentionQuotes.join(" ")}`;
export const retentionMarkdown = [
  "# TEST retention workpiece",
  "",
  retentionQuotes[0],
  "",
  retentionQuotes[1],
  "",
  "Timing remains unknown. Not genuine testimony.",
].join("\n");
export const retentionQueries = [
  {
    transition: "start-final-inspection",
    place: "dispatch-crew-available",
    arcDirection: "input",
    field: "entity",
  },
  {
    transition: "sign-off",
    place: "dispatch-crew-available",
    arcDirection: "input",
    field: "entity",
  },
] as const;

export const retentionCall = (
  name: string,
  args: Record<string, unknown>,
  id: string,
) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });

const toolOutput = (
  context: Context,
  name: string,
): Record<string, unknown> => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === name,
  );
  assert(result?.role === "toolResult");
  assert.equal(result.isError, false);
  return JSON.parse(
    result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as Record<string, unknown>;
};

const initialNet: SDCPN = {
  places: [
    {
      id: "batch-ready",
      name: "BatchReady",
      x: 0,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
    {
      id: "under-final-inspection",
      name: "UnderFinalInspection",
      x: 200,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
    {
      id: "ready-for-dispatch",
      name: "ReadyForDispatch",
      x: 400,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
    {
      id: "dispatch-crew-available",
      name: "DispatchCrewAvailable",
      x: 200,
      y: 200,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
    {
      id: "dispatch-crew-available-shadow",
      name: "DispatchCrewAvailable",
      x: 400,
      y: 200,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
  ],
  transitions: [
    {
      id: "start-final-inspection",
      name: "StartFinalInspection",
      inputArcs: [{ placeId: "batch-ready", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "under-final-inspection", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 100,
      y: 0,
    },
    {
      id: "sign-off",
      name: "SignOff",
      inputArcs: [
        { placeId: "under-final-inspection", weight: 1, type: "standard" },
      ],
      outputArcs: [
        { placeId: "ready-for-dispatch", weight: 1 },
        { placeId: "dispatch-crew-available", weight: 1 },
      ],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 300,
      y: 0,
    },
  ],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const hashOf = (definition: SDCPN): string =>
  createHash("sha256").update(JSON.stringify(definition)).digest("hex");

export const seedRetentionApplication = async (options: {
  application: Awaited<ReturnType<typeof loadBuiltBrunchApplication>>;
  faux: FauxProviderHandle;
  directory: string;
}): Promise<void> => {
  const { application, faux, directory } = options;
  const save = (name: string, value: unknown) =>
    writeFileSync(
      join(directory, `${name}.json`),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  const identity = {
    principalKey: `TEST-a5-retention-${crypto.randomUUID()}`,
    conversationId: `TEST-a5-retention-${crypto.randomUUID()}`,
  };
  const binding: BrowserBinding = {
    conversationId: identity.conversationId,
    documentId: "TEST-a5-retention-document",
    incarnationId: crypto.randomUUID(),
  };
  const url = `http://a5.in-process/agents/chat/${flueConversationIdFrom(identity)}`;
  const client = createFlueClient({
    url,
    headers: agentOwnershipHeaders(identity),
    fetch: async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
  });
  const host = createHeadlessPetrinautClient("A5 retention net", initialNet);
  let uid: string | null | undefined;
  const send = async (
    body: string,
    initialData?: {
      mode: typeof conversationConstructionMode;
      construction: { binding: BrowserBinding };
    },
  ) => {
    const receipt = await client.send({
      ...(uid === undefined ? {} : { uid }),
      ...(initialData === undefined ? {} : { initialData }),
      message: { kind: "user", body },
    });
    uid = receipt.uid;
    await client.read(receipt, { signal: AbortSignal.timeout(30_000) });
  };
  const deliver = async (
    toolCallId: string,
    toolName: string,
    output: unknown,
    metadata: unknown,
  ) => {
    const receipt = await client.send({
      uid,
      message: clientToolResultSignal([
        { toolCallId, toolName, output, metadata },
      ]),
    });
    await client.read(receipt, { signal: AbortSignal.timeout(30_000) });
  };

  let sourceId = "";
  let locators: { start: number; end: number }[] = [];
  let governingPointer: Record<string, unknown> | undefined;
  faux.setResponses([
    retentionCall(
      "read_workpiece",
      { markdown: retentionMarkdown, locateTexts: [...retentionQuotes] },
      "retention-discover",
    ),
    (context) => {
      const result = toolOutput(context, "read_workpiece");
      const source = (result.sources as { id: string; text: string }[]).find(
        (candidate) => candidate.text === retentionSource,
      );
      assert(source);
      sourceId = source.id;
      locators = (
        result.locatorLookup as {
          queries: { occurrences: { start: number; end: number }[] }[];
        }
      ).queries.map((query) => {
        assert.equal(query.occurrences.length, 1);
        return query.occurrences[0]!;
      });
      return retentionCall(
        "mutate_workpiece",
        {
          markdown: retentionMarkdown,
          evidence: locators.flatMap((locator) => [
            { locator, messageIds: [sourceId], kind: "elicited" },
            { locator, messageIds: [], kind: "formalism-constraint" },
          ]),
        },
        "retention-revision-1",
      );
    },
    retentionCall(
      "mutate_workpiece",
      { markdown: `${retentionMarkdown}\n\nUnrelated appended context.` },
      "retention-revision-2",
    ),
    retentionCall(
      "read_workpiece",
      { locateTexts: [...retentionQuotes] },
      "retention-settled-locators",
    ),
    (context) => {
      governingPointer = toolOutput(context, "read_workpiece")
        .currentWorkpiece as Record<string, unknown>;
      return fauxAssistantMessage("TEST two governing passages settled.");
    },
  ]);
  await send(retentionSource, {
    mode: conversationConstructionMode,
    construction: { binding },
  });
  assert(sourceId && governingPointer && locators.length === 2 && uid);

  const mutationCallIds = ["retention-arc", "retention-signoff-arc"] as const;
  const readCallIds = [
    "retention-before-read",
    "retention-between-read",
  ] as const;
  const mutationInputs = [
    {
      transitionId: "start-final-inspection",
      placeId: "dispatch-crew-available",
      arcDirection: "input",
      weight: "1",
      type: "standard",
    },
    {
      transitionId: "sign-off",
      placeId: "dispatch-crew-available",
      arcDirection: "input",
      weight: "1",
      type: "standard",
    },
  ] as const;
  for (const [index, mutationCallId] of mutationCallIds.entries()) {
    const readCallId = readCallIds[index]!;
    faux.setResponses([
      retentionCall(readPetrinautNetToolName, {}, readCallId),
    ]);
    await send(`TEST observe element ${index + 1}.`);
    const pre = host.definition();
    const preRevisionId = host.revisionId();
    const preHash = hashOf(pre);
    faux.setResponses([
      retentionCall(
        "addArc",
        {
          ...mutationInputs[index]!,
          brunch: {
            observationToolCallId: readCallId,
            requestedBaseHash: preHash,
            basis: {
              kind: "declared",
              revisionId: governingPointer.revisionId,
              sha256: governingPointer.sha256,
              scope: "operation",
              locators: [locators[index]!],
              rationale: `TEST governing passage ${index + 1}.`,
            },
          },
        },
        mutationCallId,
      ),
    ]);
    await deliver(
      readCallId,
      readPetrinautNetToolName,
      { title: "A5 retention net", definition: pre, extensions: [] },
      {
        observation: {
          toolCallId: readCallId,
          binding,
          observed: {
            definition: pre,
            sha256: preHash,
            revisionId: preRevisionId,
          },
        },
      },
    );
    const mutationInput = mutationInputs[index]!;
    const executableMutationInput = { ...mutationInput, weight: 1 };
    const result = await host.execute({
      toolCallId: mutationCallId,
      toolName: "addArc",
      input: executableMutationInput,
    });
    assert.deepEqual(result.output, { applied: true });
    const post = host.definition();
    const request = {
      toolCallId: mutationCallId,
      toolName: "addArc" as const,
      input: executableMutationInput,
      binding,
      requestedBaseHash: preHash,
      observationToolCallId: readCallId,
    };
    const attempt: ConstructionMutationAttempt = {
      request,
      binding,
      outcome: "applied",
      pre: { definition: pre, sha256: preHash, revisionId: preRevisionId },
      post: {
        definition: post,
        sha256: hashOf(post),
        revisionId: host.revisionId(),
      },
      effects: deriveMutationEffects(request, pre, post),
    };
    faux.setResponses([
      fauxAssistantMessage(`TEST element ${index + 1} mutation recorded.`),
    ]);
    await deliver(mutationCallId, "addArc", result.output, {
      mutationRecord: { outcome: "applied", attempts: [attempt] },
    });
  }

  faux.setResponses([
    retentionCall(
      "mutate_workpiece",
      {
        markdown: `${retentionMarkdown}\n\nUnrelated appended context.\n\nLater unrelated context; no retroactive basis.`,
      },
      "retention-revision-3",
    ),
    retentionCall(readPetrinautNetToolName, {}, "retention-live-read"),
  ]);
  await send("TEST settle later context and read the final net.");
  const finalDefinition = host.definition();
  faux.setResponses([
    retentionCall(
      "query_workpiece",
      {
        selector: {
          ...retentionQueries[0],
          observationToolCallId: "retention-live-read",
        },
      },
      "retention-live-why",
    ),
    retentionCall(readPetrinautNetToolName, {}, "retention-live-read-2"),
  ]);
  await deliver(
    "retention-live-read",
    readPetrinautNetToolName,
    {
      title: "A5 retention net",
      definition: finalDefinition,
      extensions: [],
    },
    {
      observation: {
        toolCallId: "retention-live-read",
        binding,
        observed: {
          definition: finalDefinition,
          sha256: hashOf(finalDefinition),
          revisionId: host.revisionId(),
        },
      },
    },
  );
  faux.setResponses([
    retentionCall(
      "query_workpiece",
      {
        selector: {
          ...retentionQueries[1],
          observationToolCallId: "retention-live-read-2",
        },
      },
      "retention-live-why-2",
    ),
    fauxAssistantMessage([
      fauxText("TEST two structured provenance answers recorded."),
    ]),
  ]);
  await deliver(
    "retention-live-read-2",
    readPetrinautNetToolName,
    {
      title: "A5 retention net",
      definition: finalDefinition,
      extensions: [],
    },
    {
      observation: {
        toolCallId: "retention-live-read-2",
        binding,
        observed: {
          definition: finalDefinition,
          sha256: hashOf(finalDefinition),
          revisionId: host.revisionId(),
        },
      },
    },
  );
  const history: FlueConversationSnapshot = await client.history();
  const governingPart = history.messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" &&
        part.toolCallId === "retention-revision-2" &&
        part.state === "output-available",
    );
  assert(governingPart?.type === "dynamic-tool");
  assert.equal(governingPart.state, "output-available");
  const governing = governingPart.output;
  save("seed", {
    pid: process.pid,
    identity,
    sourceId,
    locators,
    governing,
    binding,
    dbPath: process.env.BRUNCH_DEV_DB_PATH,
    uid,
    witnesses: retentionQueries.map((query, index) => ({
      query,
      quote: retentionQuotes[index],
      locator: locators[index],
      mutationToolCallId: mutationCallIds[index],
      whyToolCallId:
        index === 0 ? "retention-live-why" : "retention-live-why-2",
      observationToolCallId:
        index === 0 ? "retention-live-read" : "retention-live-read-2",
    })),
  });
  save("create-history", history);
  host.dispose();
};
