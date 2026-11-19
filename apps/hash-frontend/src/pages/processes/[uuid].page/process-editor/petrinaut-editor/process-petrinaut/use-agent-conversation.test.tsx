/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  readRetryDelaysMs,
  useAgentConversation,
} from "./use-agent-conversation";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type * as ApolloClient from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";

const accountId = "00000000-0000-4000-8000-0000000000aa";
const otherAccountId = "00000000-0000-4000-8000-0000000000bb";
const processWebId = "00000000-0000-4000-8000-000000000001";
const otherWebId = "00000000-0000-4000-8000-000000000002";
const processId =
  `${processWebId}~00000000-0000-4000-8000-00000000000a` as EntityId;
const otherProcessId =
  `${processWebId}~00000000-0000-4000-8000-00000000000b` as EntityId;
/** A process in another web. */
const elsewhereProcessId =
  `${otherWebId}~00000000-0000-4000-8000-00000000000c` as EntityId;
const agentId = "test-agent";
const conversationIdUrl =
  systemPropertyTypes.conversationId.propertyTypeBaseUrl;
const agentIdUrl = systemPropertyTypes.agentId.propertyTypeBaseUrl;
const contextEntityIdUrl =
  systemPropertyTypes.contextEntityId.propertyTypeBaseUrl;

/** One `Agent Conversation` entity in the fake graph. */
type StoredConversation = {
  entityId: EntityId;
  conversationId: string;
  agentId: string;
  contextEntityId: EntityId;
  createdById: string;
  createdAt: string;
  archived: boolean;
};

/**
 * The graph as these tests see it. Reads are answered by applying the read's
 * own filter to every stored conversation, the way the graph would answer a
 * web admin, who can see every member's conversations.
 */
const graph = vi.hoisted(() => ({
  stored: [] as StoredConversation[],
  /** The read is in flight. */
  reading: false,
  /** How many of the next reads, first or retried, fail. */
  failingReads: 0,
  /** The reads whose last attempt failed. */
  failed: new Set<string>(),
  /** The answers this page has had, by read, as Apollo keeps them. */
  answers: new Map<string, unknown>(),
  queries: [] as { skip: boolean; variables: unknown }[],
  writes: [] as { kind: string; variables: Record<string, unknown> }[],
  /** While set, a write waits for it before it lands. */
  gate: null as Promise<void> | null,
  nextEntity: 1,
  captureException: vi.fn(),
}));

vi.mock("@hashintel/petrinaut", async () => {
  const { createContext } = await import("react");
  return {
    ErrorTrackerContext: createContext({
      captureException: graph.captureException,
    }),
  };
});

vi.mock("../../../../../shared/auth-info-context", () => ({
  useAuthInfo: () => ({ authenticatedUser: { accountId } }),
}));

vi.mock("@apollo/client", async (importOriginal) => {
  const original = await importOriginal<typeof ApolloClient>();
  const { useReducer } = await import("react");

  type Clause = {
    all?: Clause[];
    equal?: [{ path: string[] }, { parameter: unknown }];
  };

  const valueAt = (conversation: StoredConversation, path: string[]) => {
    const [root, key] = path;
    if (root === "webId") {
      return conversation.entityId.split("~")[0];
    }
    if (root === "type" && key === "versionedUrl") {
      return systemEntityTypes.agentConversation.entityTypeId;
    }
    if (root === "properties" && key === conversationIdUrl) {
      return conversation.conversationId;
    }
    if (root === "properties" && key === agentIdUrl) {
      return conversation.agentId;
    }
    if (root === "properties" && key === contextEntityIdUrl) {
      return conversation.contextEntityId;
    }
    if (root === "createdById") {
      return conversation.createdById;
    }
    if (root === "archived") {
      return conversation.archived;
    }
    throw new Error(`The fake graph can't filter on ${path.join(".")}`);
  };

  const matches = (
    conversation: StoredConversation,
    clause: Clause,
  ): boolean => {
    if (clause.all) {
      return clause.all.every((inner) => matches(conversation, inner));
    }
    if (clause.equal) {
      const [{ path }, { parameter }] = clause.equal;
      return valueAt(conversation, path) === parameter;
    }
    throw new Error(`The fake graph can't apply ${JSON.stringify(clause)}`);
  };

  const answer = (stored: StoredConversation[]): QueryEntitySubgraphQuery =>
    JSON.parse(
      JSON.stringify({
        queryEntitySubgraph: {
          subgraph: {
            roots: stored.map(({ entityId, createdAt }) => ({
              baseId: entityId,
              revisionId: createdAt,
            })),
            vertices: Object.fromEntries(
              stored.map((conversation) => [
                conversation.entityId,
                {
                  [conversation.createdAt]: {
                    kind: "entity",
                    inner: {
                      metadata: {
                        recordId: {
                          entityId: conversation.entityId,
                          editionId: conversation.createdAt,
                        },
                        entityTypeIds: [
                          systemEntityTypes.agentConversation.entityTypeId,
                        ],
                        provenance: {
                          createdById: conversation.createdById,
                          createdAtDecisionTime: conversation.createdAt,
                        },
                        temporalVersioning: {
                          decisionTime: {
                            start: {
                              kind: "inclusive",
                              limit: conversation.createdAt,
                            },
                            end: { kind: "unbounded" },
                          },
                          transactionTime: {
                            start: {
                              kind: "inclusive",
                              limit: conversation.createdAt,
                            },
                            end: { kind: "unbounded" },
                          },
                        },
                      },
                      properties: {
                        [conversationIdUrl]: conversation.conversationId,
                        [agentIdUrl]: conversation.agentId,
                        [contextEntityIdUrl]: conversation.contextEntityId,
                      },
                    },
                  },
                },
              ]),
            ),
            edges: {},
            temporalAxes: {},
          },
        },
      }),
    ) as QueryEntitySubgraphQuery;

  const useQuery = (
    _query: unknown,
    {
      skip,
      variables,
    }: { skip?: boolean; variables: QueryEntitySubgraphQueryVariables },
  ) => {
    const [, rerender] = useReducer((count: number) => count + 1, 0);
    graph.queries.push({ skip: skip ?? false, variables });
    const key = JSON.stringify(variables);
    const refetch = async () => {
      if (graph.failingReads > 0) {
        graph.failingReads--;
        throw new Error("The read failed again");
      }
      graph.failed.delete(key);
      rerender();
    };
    if (skip || graph.reading) {
      return { data: undefined, error: undefined, refetch };
    }
    if (!graph.answers.has(key) && !graph.failed.has(key)) {
      if (graph.failingReads > 0) {
        graph.failingReads--;
        graph.failed.add(key);
      }
    }
    if (graph.failed.has(key)) {
      return { data: undefined, error: readError, refetch };
    }
    // Answered once per read, and the same object after, as Apollo's is: a
    // write isn't seen until the page reads again.
    if (!graph.answers.has(key)) {
      const filter = variables.request.filter as Clause;
      graph.answers.set(
        key,
        answer(
          graph.stored.filter((conversation) => matches(conversation, filter)),
        ),
      );
    }
    return { data: graph.answers.get(key), error: undefined, refetch };
  };
  const readError = new Error("The read failed");

  // One mutate function per mutation, stable across renders, as Apollo's is.
  const mutations = new Map<string, unknown[]>();
  const useMutation = (mutation: {
    definitions: readonly { name?: { value: string } }[];
  }) => {
    const kind = mutation.definitions[0]?.name?.value ?? "unknown";
    const existing = mutations.get(kind);
    if (existing) {
      return existing;
    }
    const mutate = [
      async ({ variables }: { variables: Record<string, unknown> }) => {
        graph.writes.push({ kind, variables });
        await graph.gate;
        const webId = variables.webId as string;
        const entityId = `${webId}~created-${graph.nextEntity}` as EntityId;
        const { value } = variables.properties as {
          value: Record<string, { value: string }>;
        };
        graph.stored.push({
          entityId,
          conversationId: value[conversationIdUrl]?.value ?? "",
          agentId: value[agentIdUrl]?.value ?? "",
          contextEntityId: value[contextEntityIdUrl]?.value as EntityId,
          createdById: accountId,
          createdAt: `2027-01-01T00:00:${String(graph.nextEntity).padStart(2, "0")}.000Z`,
          archived: false,
        });
        graph.nextEntity++;
        return {
          data: {
            createEntity: {
              metadata: {
                recordId: { entityId, editionId: "edition" },
                entityTypeIds: variables.entityTypeIds,
              },
              properties: {},
            },
          },
        };
      },
    ];
    mutations.set(kind, mutate);
    return mutate;
  };

  return { ...original, useQuery, useMutation };
});

beforeEach(() => {
  graph.stored = [];
  graph.reading = false;
  graph.failingReads = 0;
  graph.failed.clear();
  graph.answers.clear();
  graph.queries.length = 0;
  graph.writes.length = 0;
  graph.gate = null;
  graph.nextEntity = 1;
  graph.captureException.mockReset();
});
afterEach(() => {
  cleanup();
});

const renderConversation = (contextEntityId: EntityId = processId) =>
  renderHook(
    (props: { contextEntityId: EntityId }) =>
      useAgentConversation({ agentId, ...props }),
    { initialProps: { contextEntityId } },
  );

/** Opens the page again, in this browser or another: everything is read afresh. */
const reload = (contextEntityId: EntityId = processId) => {
  cleanup();
  graph.answers.clear();
  return renderConversation(contextEntityId);
};

const stored = (
  name: string,
  overrides: Partial<StoredConversation> = {},
): StoredConversation => ({
  entityId: `${processWebId}~${name}` as EntityId,
  conversationId: `${name}-conversation`,
  agentId,
  contextEntityId: processId,
  createdById: accountId,
  createdAt: "2026-11-10T00:00:00.000Z",
  archived: false,
  ...overrides,
});

const createdConversation = (
  conversationId: string,
  contextEntityId: EntityId = processId,
) => ({
  kind: "createEntity",
  variables: expect.objectContaining({
    entityTypeIds: [systemEntityTypes.agentConversation.entityTypeId],
    webId: contextEntityId.split("~")[0],
    properties: expect.objectContaining({
      value: {
        [conversationIdUrl]: expect.objectContaining({ value: conversationId }),
        [agentIdUrl]: expect.objectContaining({ value: agentId }),
        [contextEntityIdUrl]: expect.objectContaining({
          value: contextEntityId,
        }),
      },
    }),
  }),
});

/** Lets queued writes settle. */
const settle = () => act(async () => {});

test("the open conversation is the user's newest with this agent on this context", () => {
  graph.stored = [
    stored("older", { createdAt: "2026-11-01T00:00:00.000Z" }),
    stored("newer", { createdAt: "2026-11-02T00:00:00.000Z" }),
    stored("archived", {
      createdAt: "2026-11-03T00:00:00.000Z",
      archived: true,
    }),
    stored("other-agent", {
      createdAt: "2026-11-04T00:00:00.000Z",
      agentId: "another-agent",
    }),
    stored("elsewhere", {
      createdAt: "2026-11-05T00:00:00.000Z",
      contextEntityId: otherProcessId,
    }),
  ];
  graph.reading = true;
  const { result, rerender } = renderConversation();
  // Still reading: nothing binds yet.
  expect(result.current.conversationId).toBeUndefined();

  graph.reading = false;
  rerender({ contextEntityId: processId });
  expect(result.current.conversationId).toBe("newer-conversation");

  rerender({ contextEntityId: otherProcessId });
  expect(result.current.conversationId).toBe("elsewhere-conversation");
});

test("another member's conversation on the same context, which a web admin's read could return, is not opened", () => {
  graph.stored = [
    stored("mine", { createdAt: "2026-11-01T00:00:00.000Z" }),
    stored("theirs", {
      createdAt: "2026-11-02T00:00:00.000Z",
      createdById: otherAccountId,
    }),
  ];
  const { result } = renderConversation();
  expect(result.current.conversationId).toBe("mine-conversation");

  graph.stored = [stored("theirs", { createdById: otherAccountId })];
  const { result: reloaded } = reload();
  expect(reloaded.current.conversationId).toBeNull();
});

test("a conversation's first message creates its entity in the context's web, recording the context, and later messages write nothing", async () => {
  const { result } = renderConversation(elsewhereProcessId);
  expect(result.current.conversationId).toBeNull();

  act(() => result.current.start("first"));
  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toEqual([
    createdConversation("first", elsewhereProcessId),
  ]);

  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toHaveLength(1);
  expect(graph.captureException).not.toHaveBeenCalled();

  // Read again, it is the open one.
  const { result: reloaded } = reload(elsewhereProcessId);
  expect(reloaded.current.conversationId).toBe("first");
});

test("a message in a conversation that already has its entity writes nothing", async () => {
  graph.stored = [stored("open")];
  const { result } = renderConversation();
  act(() => result.current.start("open-conversation"));
  await settle();
  expect(graph.writes).toEqual([]);
});

test("clearing creates the next conversation's entity, which becomes the open one, and leaves the earlier one as it is", async () => {
  graph.stored = [stored("open")];
  const { result } = renderConversation();

  act(() => result.current.replace("next"));
  await settle();
  expect(graph.writes).toEqual([createdConversation("next")]);

  // Its messages then write nothing more.
  act(() => result.current.start("next"));
  await settle();
  expect(graph.writes).toHaveLength(1);

  const { result: reloaded } = reload();
  expect(reloaded.current.conversationId).toBe("next");
  expect(graph.stored.map(({ archived }) => archived)).toEqual([false, false]);
});

test("a write queued on one context is recorded against it after the user moves to another, and writes run one at a time", async () => {
  let release = () => {};
  graph.gate = new Promise((resolve) => {
    release = resolve;
  });
  const { result, rerender } = renderConversation(processId);
  act(() => result.current.start("on-a"));
  act(() => result.current.replace("cleared-on-a"));
  await settle();
  // The second waits for the first.
  expect(graph.writes).toHaveLength(1);

  rerender({ contextEntityId: elsewhereProcessId });
  act(() => result.current.start("on-b"));
  release();
  await waitFor(() => expect(graph.writes).toHaveLength(3));
  expect(graph.writes).toEqual([
    createdConversation("on-a", processId),
    createdConversation("cleared-on-a", processId),
    createdConversation("on-b", elsewhereProcessId),
  ]);
});

test("a read that fails is tried again, and opens what the retry reads", async () => {
  vi.useFakeTimers();
  try {
    graph.stored = [stored("open")];
    graph.failingReads = 2;
    const { result } = renderConversation();
    expect(result.current.conversationId).toBeUndefined();

    await act(() => vi.advanceTimersByTimeAsync(readRetryDelaysMs[0]));
    expect(result.current.conversationId).toBeUndefined();

    await act(() => vi.advanceTimersByTimeAsync(readRetryDelaysMs[1]));
    expect(result.current.conversationId).toBe("open-conversation");
    expect(graph.captureException).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("when every retry fails the context has no open conversation, and its first message creates one", async () => {
  vi.useFakeTimers();
  try {
    graph.stored = [stored("unreachable")];
    graph.failingReads = 1 + readRetryDelaysMs.length;
    const { result } = renderConversation();

    for (const delayMs of readRetryDelaysMs) {
      expect(result.current.conversationId).toBeUndefined();
      await act(() => vi.advanceTimersByTimeAsync(delayMs));
    }
    expect(result.current.conversationId).toBeNull();
    expect(graph.captureException).toHaveBeenCalledTimes(
      1 + readRetryDelaysMs.length,
    );

    act(() => result.current.start("fresh"));
    await act(() => vi.runAllTimersAsync());
    expect(graph.writes).toEqual([createdConversation("fresh")]);
  } finally {
    vi.useRealTimers();
  }
});

test("the result keeps its identity while the open conversation, as read, is unchanged", () => {
  const { result, rerender } = renderConversation();
  const first = result.current;
  rerender({ contextEntityId: processId });
  expect(result.current).toBe(first);
});
