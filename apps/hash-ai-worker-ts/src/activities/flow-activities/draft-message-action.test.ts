import { beforeEach, describe, expect, it, vi } from "vitest";

import { storePayload } from "@local/hash-backend-utils/flows/payload-storage";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import { StatusCode } from "@local/status";

import { getLlmResponse } from "../shared/get-llm-response.js";
import { draftMessageAction } from "./draft-message-action.js";

import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type {
  PayloadValue,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

const workflowId = "workflow";
const objects = new Map<string, string>();
const storageProvider = {
  uploadDirect: ({ key, body }: { key: string; body: string }) => {
    objects.set(key, body);
    return Promise.resolve();
  },
  downloadDirect: ({ key }: { key: string }) =>
    Promise.resolve(Buffer.from(objects.get(key) ?? "null")),
} as unknown as FileStorageProvider;

const webId = "00000000-0000-4000-8000-000000000001" as WebId;
const otherWebId = "00000000-0000-4000-8000-000000000002" as WebId;

vi.mock("../shared/graph-api-client.js", () => ({ graphApiClient: {} }));
vi.mock("../shared/get-flow-context.js", () => ({
  getFlowContext: () =>
    Promise.resolve({
      flowEntityId: "flow",
      workflowId,
      runId: "run",
      stepId: "draft",
      userAuthentication: { actorId: "user" },
      webId: "00000000-0000-4000-8000-000000000001",
    }),
}));
vi.mock(
  "@local/hash-backend-utils/flows/payload-storage",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getStorageProvider: () => storageProvider,
  }),
);
vi.mock("@local/hash-graph-sdk/entity", () => ({
  queryEntitySubgraph: vi.fn(),
}));
vi.mock("@local/hash-backend-utils/simplified-graph", () => ({
  getSimpleGraph: vi.fn(),
}));
vi.mock("../shared/get-llm-response.js", () => ({ getLlmResponse: vi.fn() }));

const entityIdOf = (index: number, web: WebId = webId) =>
  `${web}~00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as EntityId;

/** Answers the graph query with these entities, each a Person with a name. */
const mockGraph = (entityIds: EntityId[]) => {
  vi.mocked(queryEntitySubgraph).mockResolvedValueOnce({
    subgraph: { roots: entityIds.map((entityId) => ({ baseId: entityId })) },
  } as unknown as Awaited<ReturnType<typeof queryEntitySubgraph>>);

  vi.mocked(getSimpleGraph).mockReturnValueOnce({
    entities: entityIds.map((entityId) => ({
      entityId,
      entityTypes: ["Person"],
      properties: { Name: `Person ${entityId.slice(-2)}` },
      links: [],
      draft: false,
      webUuid: webId,
    })),
    entityTypes: [],
  });
};

/** A model response that submits this draft. */
const submits = (input: object) => ({
  status: "ok" as const,
  message: {
    role: "assistant" as const,
    content: [
      { type: "tool_use" as const, id: "call", name: "submitDraft", input },
    ],
  },
});

const respondWith = (...responses: object[]) => {
  for (const response of responses) {
    vi.mocked(getLlmResponse).mockResolvedValueOnce(
      response as Awaited<ReturnType<typeof getLlmResponse>>,
    );
  }
};

const validDraft = { subject: "Your order", body: "Hi Ada,\n\nThanks!" };

const draftOutputs = [
  {
    outputs: [
      {
        outputName: "subject",
        payload: { kind: "Text", value: validDraft.subject },
      },
      { outputName: "body", payload: { kind: "Text", value: validDraft.body } },
    ],
  },
];

const run = (params: {
  instructions?: string;
  context?: string;
  entities?: PayloadValue<"EntityId", true>;
}) =>
  draftMessageAction({
    inputs: [
      {
        inputName: "instructions",
        payload: {
          kind: "Text",
          value: params.instructions ?? "Thank them for their order.",
        },
      },
      ...(params.context === undefined
        ? []
        : [
            {
              inputName: "context",
              payload: { kind: "Text" as const, value: params.context },
            },
          ]),
      ...(params.entities === undefined
        ? []
        : [
            {
              inputName: "entities",
              payload: { kind: "EntityId" as const, value: params.entities },
            },
          ]),
    ] satisfies StepInput[],
  });

/** The text of the prompt the model was first given. */
const firstPrompt = () => {
  const [params] = vi.mocked(getLlmResponse).mock.calls[0]!;
  const [message] = params.messages;
  const [content] = message!.content;
  return content && "text" in content ? content.text : undefined;
};

const storeEntityIds = (value: EntityId[]) =>
  storePayload({
    storageProvider,
    workflowId,
    runId: "run",
    stepId: "query",
    outputName: "entities",
    kind: "EntityId",
    value,
  });

describe("draftMessageAction", () => {
  beforeEach(() => {
    vi.mocked(getLlmResponse).mockReset();
    vi.mocked(queryEntitySubgraph).mockReset();
    vi.mocked(getSimpleGraph).mockReset();
  });

  it("puts a subject with line breaks on one line", async () => {
    respondWith(
      submits({ subject: " Your order\r\nBcc: x@example.com ", body: "Hi" }),
    );

    expect(await run({})).toMatchObject({
      code: StatusCode.Ok,
      contents: [
        {
          outputs: [
            {
              outputName: "subject",
              payload: { value: "Your order Bcc: x@example.com" },
            },
            { outputName: "body" },
          ],
        },
      ],
    });
  });

  it("drafts from instructions alone, in one model call, without reading the graph", async () => {
    respondWith(submits(validDraft));

    expect(await run({})).toEqual({
      code: StatusCode.Ok,
      contents: draftOutputs,
    });
    expect(getLlmResponse).toHaveBeenCalledTimes(1);
    expect(queryEntitySubgraph).not.toHaveBeenCalled();
    expect(firstPrompt()).toContain("Thank them for their order.");
    expect(firstPrompt()).not.toContain("<Context>");
    expect(firstPrompt()).not.toContain("<Entities>");
  });

  it("gives the model the context text", async () => {
    respondWith(submits(validDraft));

    expect(await run({ context: "Order #42 ships on Friday." })).toMatchObject({
      code: StatusCode.Ok,
    });
    expect(firstPrompt()).toContain("Order #42 ships on Friday.");
  });

  it("gives the model the simplified properties of each entity in a stored list", async () => {
    const entityIds = [entityIdOf(1), entityIdOf(2), entityIdOf(1)];
    mockGraph([entityIdOf(1), entityIdOf(2)]);
    respondWith(submits(validDraft));

    expect(
      await run({ entities: await storeEntityIds(entityIds) }),
    ).toMatchObject({ code: StatusCode.Ok, contents: draftOutputs });

    const prompt = firstPrompt();
    expect(prompt).toContain("Thank them for their order.");
    expect(prompt).toMatch(/"Name":\s*"Person 01"/);
    expect(prompt).toMatch(/"Name":\s*"Person 02"/);
    expect(prompt).toContain('"Person"');
    /* A repeated entity is described once. */
    expect(prompt?.match(/Person 01/g)).toHaveLength(1);
  });

  it("drafts from the one entity a for-each item names, wrapped into a list", async () => {
    const stored = await storeEntityIds([entityIdOf(1), entityIdOf(2)]);
    mockGraph([entityIdOf(2)]);
    respondWith(submits(validDraft));

    expect(
      await run({
        entities: [
          {
            __stored: true,
            kind: "EntityId",
            array: false,
            of: stored,
            index: 1,
          },
        ],
      }),
    ).toMatchObject({ code: StatusCode.Ok });

    expect(firstPrompt()).toContain("Person 02");
    expect(firstPrompt()).not.toContain("Person 01");
  });

  it("loads the draft an entity ID with a draft ID names", async () => {
    const draftEntityId =
      `${entityIdOf(1)}~00000000-0000-4000-8000-0000000000dd` as EntityId;
    mockGraph([draftEntityId]);
    respondWith(submits(validDraft));

    expect(await run({ entities: [draftEntityId] })).toMatchObject({
      code: StatusCode.Ok,
    });
    expect(
      JSON.stringify(vi.mocked(queryEntitySubgraph).mock.calls[0]![2].filter),
    ).toContain("00000000-0000-4000-8000-0000000000dd");
  });

  it("accepts 20 entities", async () => {
    const entityIds = Array.from({ length: 20 }, (_, index) =>
      entityIdOf(index + 1),
    );
    mockGraph(entityIds);
    respondWith(submits(validDraft));

    expect(
      await run({ entities: await storeEntityIds(entityIds) }),
    ).toMatchObject({ code: StatusCode.Ok });
  });

  it("fails for more than 20 entities, before reading them or calling the model", async () => {
    const entityIds = Array.from({ length: 21 }, (_, index) =>
      entityIdOf(index + 1),
    );

    expect(await run({ entities: await storeEntityIds(entityIds) })).toEqual({
      code: StatusCode.InvalidArgument,
      message:
        "A message can be drafted from at most 20 entities, but 21 were given.",
      contents: [],
    });
    expect(queryEntitySubgraph).not.toHaveBeenCalled();
    expect(getLlmResponse).not.toHaveBeenCalled();
  });

  it("fails for an entity that is missing or the user can't read, rather than leaving it out", async () => {
    mockGraph([entityIdOf(1)]);

    expect(await run({ entities: [entityIdOf(1), entityIdOf(2)] })).toEqual({
      code: StatusCode.NotFound,
      message: `Entity ${entityIdOf(2)} wasn't found or you don't have access to it.`,
      contents: [],
    });
    expect(getLlmResponse).not.toHaveBeenCalled();
  });

  it("fails for an entity in another web, without reading it", async () => {
    expect(
      await run({ entities: [entityIdOf(1), entityIdOf(2, otherWebId)] }),
    ).toMatchObject({ code: StatusCode.InvalidArgument });
    expect(queryEntitySubgraph).not.toHaveBeenCalled();
    expect(getLlmResponse).not.toHaveBeenCalled();
  });

  it("asks again after an invalid draft, telling the model what was wrong", async () => {
    respondWith(
      submits({ subject: "Your order", body: "  \n " }),
      submits(validDraft),
    );

    expect(await run({})).toEqual({
      code: StatusCode.Ok,
      contents: draftOutputs,
    });
    expect(getLlmResponse).toHaveBeenCalledTimes(2);

    const [retryParams] = vi.mocked(getLlmResponse).mock.calls[1]!;
    expect(retryParams.messages.at(-1)).toMatchObject({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "call",
          is_error: true,
          content: expect.stringContaining("body is empty") as string,
        },
      ],
    });
  });

  it.each([
    {
      name: "no draft",
      response: {
        status: "ok",
        message: { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      },
    },
    {
      name: "an empty subject",
      response: submits({ subject: "", body: "Hi" }),
    },
    {
      name: "a whitespace-only subject",
      response: submits({ subject: " \t", body: "Hi" }),
    },
    { name: "an empty body", response: submits({ subject: "Hi", body: "" }) },
    {
      name: "a whitespace-only body",
      response: submits({ subject: "Hi", body: "\n \n" }),
    },
  ])(
    "fails with no outputs after 3 attempts that each return $name",
    async ({ response }) => {
      respondWith(response, response, response);

      const { code, message, contents } = await run({});
      expect(code).toBe(StatusCode.Internal);
      expect(message).toContain("in 3 attempts");
      expect(contents).toEqual([]);
      expect(getLlmResponse).toHaveBeenCalledTimes(3);
    },
  );

  it.each(["", " \n\t"])(
    "fails for empty instructions, without calling the model: %j",
    async (instructions) => {
      expect(await run({ instructions })).toEqual({
        code: StatusCode.InvalidArgument,
        message: "The instructions are empty.",
        contents: [],
      });
      expect(getLlmResponse).not.toHaveBeenCalled();
    },
  );

  it("drafts from a long context that fits", async () => {
    respondWith(submits(validDraft));

    expect(await run({ context: "x".repeat(399_000) })).toMatchObject({
      code: StatusCode.Ok,
    });
  });

  it("fails for a prompt too long for the model, rather than cutting it short", async () => {
    const { code, message, contents } = await run({
      context: "x".repeat(400_001),
    });
    expect(code).toBe(StatusCode.InvalidArgument);
    expect(message).toContain("at most 400,000 fit");
    expect(contents).toEqual([]);
    expect(getLlmResponse).not.toHaveBeenCalled();
  });

  it("fails for a draft longer than the model may write, without asking again", async () => {
    respondWith({ status: "max-tokens" });

    expect(await run({})).toMatchObject({
      code: StatusCode.Internal,
      message: expect.stringContaining("longer than 2,000 tokens") as string,
      contents: [],
    });
    expect(getLlmResponse).toHaveBeenCalledTimes(1);
  });

  it("starts no attempt after 2 minutes, so the step ends within its timeout", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      const invalid = submits({ subject: "Hi", body: "" });
      vi.mocked(getLlmResponse)
        .mockImplementationOnce(() => {
          vi.setSystemTime(Date.now() + 60_000);
          return Promise.resolve(
            invalid as Awaited<ReturnType<typeof getLlmResponse>>,
          );
        })
        .mockImplementationOnce(() => {
          vi.setSystemTime(Date.now() + 61_000);
          return Promise.resolve(
            invalid as Awaited<ReturnType<typeof getLlmResponse>>,
          );
        });

      const { code, message, contents } = await run({});
      expect(code).toBe(StatusCode.Internal);
      expect(message).toContain("in 2 attempts, and there wasn't time");
      expect(contents).toEqual([]);
      expect(getLlmResponse).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
