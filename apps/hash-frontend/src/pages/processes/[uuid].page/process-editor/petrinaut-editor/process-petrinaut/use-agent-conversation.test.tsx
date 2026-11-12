/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useAgentConversation } from "./use-agent-conversation";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type * as ApolloClient from "@apollo/client";
import type * as GraphStdlib from "@blockprotocol/graph/stdlib";
import type { EntityId } from "@blockprotocol/type-system";

const userWebId = "00000000-0000-4000-8000-0000000000aa";
const processWebId = "00000000-0000-4000-8000-000000000001";
const processId =
  `${processWebId}~00000000-0000-4000-8000-00000000000a` as EntityId;
const otherProcessId =
  `${processWebId}~00000000-0000-4000-8000-00000000000b` as EntityId;
const agentId = "test-agent";
const conversationIdUrl =
  systemPropertyTypes.conversationId.propertyTypeBaseUrl;
const agentIdUrl = systemPropertyTypes.agentId.propertyTypeBaseUrl;

type StoredConversation = {
  entityId: EntityId;
  conversationId: string;
  createdAt: string;
  /** What it is linked to, and whether the read returns it: absent when unlinked. */
  subject?: { entityId: EntityId; seen: boolean };
};

/** The graph as these tests see it: the user's open conversations with the agent. */
const graph = vi.hoisted(() => ({
  /** `null` while the read is in flight. */
  stored: null as StoredConversation[] | null,
  /** The subjects the user archived. */
  archivedSubjects: [] as EntityId[],
  queries: [] as { skip: boolean; variables: unknown }[],
  writes: [] as { kind: string; variables: Record<string, unknown> }[],
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
  useAuthInfo: () => ({ authenticatedUser: { accountId: userWebId } }),
}));

// The subgraph's roots are real; its link traversal is answered from the fake
// graph, since these tests are about what the page does with the answer.
vi.mock("@blockprotocol/graph/stdlib", async (importOriginal) => ({
  ...(await importOriginal<typeof GraphStdlib>()),
  getOutgoingLinkAndTargetEntities: (_subgraph: unknown, entityId: string) => {
    const subject = graph.stored?.find(
      (conversation) => conversation.entityId === entityId,
    )?.subject;
    if (subject === undefined) {
      return [];
    }
    // As the graph does: an archived subject, like one the user can't see,
    // is named by the link but not returned.
    return [
      {
        linkEntity: [{ linkData: { rightEntityId: subject.entityId } }],
        rightEntity: subject.seen
          ? [{ metadata: { recordId: { entityId: subject.entityId } } }]
          : [],
      },
    ];
  },
}));

vi.mock("@apollo/client", async (importOriginal) => {
  const original = await importOriginal<typeof ApolloClient>();

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
              stored.map(({ entityId, conversationId, createdAt }) => [
                entityId,
                {
                  [createdAt]: {
                    kind: "entity",
                    inner: {
                      metadata: {
                        recordId: { entityId, editionId: createdAt },
                        entityTypeIds: [
                          systemEntityTypes.agentConversation.entityTypeId,
                        ],
                        provenance: { createdAtDecisionTime: createdAt },
                        temporalVersioning: {
                          decisionTime: {
                            start: { kind: "inclusive", limit: createdAt },
                            end: { kind: "unbounded" },
                          },
                          transactionTime: {
                            start: { kind: "inclusive", limit: createdAt },
                            end: { kind: "unbounded" },
                          },
                        },
                      },
                      properties: {
                        [conversationIdUrl]: conversationId,
                        [agentIdUrl]: agentId,
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

  let answered: { stored: StoredConversation[]; data: unknown } | null = null;
  let archivedAnswer: { key: string; data: unknown } | null = null;
  const useQuery = (
    _query: unknown,
    {
      skip,
      variables,
    }: { skip?: boolean; variables: QueryEntitySubgraphQueryVariables },
  ) => {
    // The second read: which of the subjects the first didn't return are archived.
    if (JSON.stringify(variables).includes('"parameter":true')) {
      if (skip) {
        return { data: undefined, error: undefined };
      }
      const asked = JSON.stringify(variables);
      const key = graph.archivedSubjects
        .filter((entityId) => asked.includes(entityId.split("~")[1] ?? "~"))
        .join();
      if (archivedAnswer?.key !== key) {
        archivedAnswer = {
          key,
          data: answer(
            key === ""
              ? []
              : key.split(",").map((entityId) => ({
                  entityId: entityId as EntityId,
                  conversationId: "",
                  createdAt: "2026-11-01T00:00:00.000Z",
                })),
          ),
        };
      }
      return { data: archivedAnswer.data, error: undefined };
    }
    graph.queries.push({ skip: skip ?? false, variables });
    if (skip || graph.stored === null) {
      return { data: undefined, error: undefined };
    }
    // The same data object while the answer is unchanged, as Apollo's is.
    if (answered?.stored !== graph.stored) {
      answered = { stored: graph.stored, data: answer(graph.stored) };
    }
    return { data: answered.data, error: undefined };
  };

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
      ({ variables }: { variables: Record<string, unknown> }) => {
        graph.writes.push({ kind, variables });
        const entityId = `${userWebId}~created-${graph.nextEntity++}`;
        return Promise.resolve({
          data: {
            createEntity: {
              metadata: {
                recordId: { entityId, editionId: "edition" },
                entityTypeIds: variables.entityTypeIds,
              },
              properties: {},
            },
          },
        });
      },
    ];
    mutations.set(kind, mutate);
    return mutate;
  };

  return { ...original, useQuery, useMutation };
});

beforeEach(() => {
  graph.stored = null;
  graph.archivedSubjects = [];
  graph.queries.length = 0;
  graph.writes.length = 0;
  graph.nextEntity = 1;
  graph.captureException.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderConversation = (
  subjectExists: boolean,
  subjectEntityId: EntityId = processId,
) =>
  renderHook(
    (props: { subjectExists: boolean; subjectEntityId: EntityId }) =>
      useAgentConversation({ agentId, ...props }),
    { initialProps: { subjectExists, subjectEntityId } },
  );

const createdConversation = (conversationId: string) => ({
  kind: "createEntity",
  variables: expect.objectContaining({
    entityTypeIds: [systemEntityTypes.agentConversation.entityTypeId],
    webId: userWebId,
    properties: expect.objectContaining({
      value: {
        [conversationIdUrl]: expect.objectContaining({ value: conversationId }),
        [agentIdUrl]: expect.objectContaining({ value: agentId }),
      },
    }),
  }),
});

const createdLink = (conversationEntityId: string, subject = processId) => ({
  kind: "createEntity",
  variables: expect.objectContaining({
    entityTypeIds: [systemLinkEntityTypes.hasSubject.linkEntityTypeId],
    webId: userWebId,
    linkData: { leftEntityId: conversationEntityId, rightEntityId: subject },
  }),
});

const archived = (...entityIds: string[]) => ({
  kind: "archiveEntities",
  variables: { entityIds },
});

const stored = (
  name: string,
  subject?: StoredConversation["subject"],
  createdAt = "2026-11-10T00:00:00.000Z",
): StoredConversation => ({
  entityId: `${userWebId}~${name}` as EntityId,
  conversationId: `${name}-conversation`,
  createdAt,
  ...(subject === undefined ? {} : { subject }),
});

const live = (entityId: EntityId) => ({ entityId, seen: true });
const unseen = (entityId: EntityId) => ({ entityId, seen: false });
const archivedProcessId =
  `${processWebId}~00000000-0000-4000-8000-00000000000c` as EntityId;
const lostProcessId =
  `${processWebId}~00000000-0000-4000-8000-00000000000d` as EntityId;

/** Lets queued writes settle. */
const settle = () => act(async () => {});

test("the read asks for the user's open conversations with this agent, and the subject's newest is the open one", () => {
  const { result, rerender } = renderConversation(true);
  // Still reading: nothing binds yet.
  expect(result.current.conversationId).toBeUndefined();
  const query = JSON.stringify(graph.queries.at(-1)?.variables);
  expect(query).toContain(userWebId);
  expect(query).toContain(agentId);
  expect(query).toContain(systemEntityTypes.agentConversation.entityTypeId);

  graph.stored = [
    stored("older", live(processId), "2026-11-01T00:00:00.000Z"),
    stored("newer", live(processId), "2026-11-02T00:00:00.000Z"),
    stored("elsewhere", live(otherProcessId), "2026-11-03T00:00:00.000Z"),
  ];
  rerender({ subjectExists: true, subjectEntityId: processId });
  expect(result.current.conversationId).toBe("newer-conversation");

  // Another subject reads from the same answer, with nothing in between.
  rerender({ subjectExists: true, subjectEntityId: otherProcessId });
  expect(result.current.conversationId).toBe("elsewhere-conversation");
});

test("a conversation's first message creates its entity, linked to the subject, and later messages write nothing", async () => {
  graph.stored = [];
  const { result } = renderConversation(true);
  expect(result.current.conversationId).toBeNull();

  act(() => result.current.start("first"));
  await waitFor(() => expect(graph.writes).toHaveLength(2));
  expect(graph.writes).toEqual([
    createdConversation("first"),
    createdLink(`${userWebId}~created-1`),
  ]);

  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toHaveLength(2);
  expect(graph.captureException).not.toHaveBeenCalled();
});

test("a message in a conversation that already has its entity writes nothing", async () => {
  graph.stored = [stored("open", live(processId))];
  const { result } = renderConversation(true);
  act(() => result.current.start("open-conversation"));
  await settle();
  expect(graph.writes).toEqual([]);
});

test("clearing creates the next conversation's entity and leaves the earlier one as it is", async () => {
  graph.stored = [stored("open", live(processId))];
  const { result } = renderConversation(true);

  act(() => result.current.replace("next"));
  await waitFor(() => expect(graph.writes).toHaveLength(2));
  expect(graph.writes).toEqual([
    createdConversation("next"),
    createdLink(`${userWebId}~created-1`),
  ]);

  // Its messages then write nothing more.
  act(() => result.current.start("next"));
  await settle();
  expect(graph.writes).toHaveLength(2);
});

test("a draft's conversations have unlinked entities until the draft's first save, which links them without unbinding the open one", async () => {
  graph.stored = [];
  const { result, rerender } = renderConversation(false);
  const beforeSave = result.current;
  expect(beforeSave.conversationId).toBeNull();

  act(() => result.current.start("on-draft"));
  act(() => result.current.replace("cleared-on-draft"));
  await waitFor(() => expect(graph.writes).toHaveLength(2));
  expect(graph.writes).toEqual([
    createdConversation("on-draft"),
    createdConversation("cleared-on-draft"),
  ]);

  // The first save lands: both are about the process it created.
  const queriesBeforeSave = graph.queries.length;
  rerender({ subjectExists: true, subjectEntityId: processId });
  await waitFor(() => expect(graph.writes).toHaveLength(4));
  expect(graph.writes.slice(2)).toEqual([
    createdLink(`${userWebId}~created-1`),
    createdLink(`${userWebId}~created-2`),
  ]);
  // Same object, so nothing built on it is rebuilt, and no new read was asked for.
  expect(result.current).toBe(beforeSave);
  expect(
    graph.queries
      .slice(queriesBeforeSave)
      .every(
        ({ variables }) =>
          JSON.stringify(variables) ===
          JSON.stringify(graph.queries[0]?.variables),
      ),
  ).toBe(true);

  act(() => result.current.start("cleared-on-draft"));
  await settle();
  expect(graph.writes).toHaveLength(4);
});

test("a draft's entity found again after a reload is reused, not created twice", async () => {
  graph.stored = [stored("draft", undefined, new Date().toISOString())];
  const { result, rerender } = renderConversation(false);
  act(() => result.current.start("draft-conversation"));
  await settle();
  expect(graph.writes).toEqual([]);

  rerender({ subjectExists: true, subjectEntityId: processId });
  await waitFor(() => expect(graph.writes).toHaveLength(1));
  expect(graph.writes[0]).toEqual(createdLink(`${userWebId}~draft`));
});

test("opening the page ends conversations whose subject is archived and those left unlinked for a day, and leaves one whose subject the user can't see", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00.000Z"));
  graph.stored = [
    stored("open", live(processId)),
    stored("of-archived", unseen(archivedProcessId)),
    stored("abandoned", undefined, "2026-11-11T11:00:00.000Z"),
    stored("recent-draft", undefined, "2026-11-12T11:00:00.000Z"),
    stored("of-lost", unseen(lostProcessId)),
  ];
  graph.archivedSubjects = [archivedProcessId];
  renderConversation(true);
  await waitFor(() => expect(graph.writes).toHaveLength(1));
  expect(graph.writes[0]).toEqual(
    archived(`${userWebId}~abandoned`, `${userWebId}~of-archived`),
  );
});

test("the result keeps its identity while the open conversation, as read, is unchanged", () => {
  graph.stored = [];
  const { result, rerender } = renderConversation(true);
  const first = result.current;
  rerender({ subjectExists: true, subjectEntityId: processId });
  expect(result.current).toBe(first);
});
