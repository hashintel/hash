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

import { useBrunchConversationPointer } from "./use-brunch-conversation-pointer";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type * as ApolloClient from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";

const userWebId = "00000000-0000-4000-8000-0000000000aa";
const processWebId = "00000000-0000-4000-8000-000000000001";
const processEntityId =
  `${processWebId}~00000000-0000-4000-8000-00000000000a` as EntityId;
const conversationIdUrl =
  systemPropertyTypes.conversationId.propertyTypeBaseUrl;

type StoredConversation = {
  entityId: EntityId;
  conversationId: string;
  createdAt: string;
};

/** The graph as these tests see it: the user's conversation entities. */
const graph = vi.hoisted(() => ({
  /** `null` while the read is in flight. */
  stored: null as StoredConversation[] | null,
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
                      properties: { [conversationIdUrl]: conversationId },
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
  const useQuery = (
    _query: unknown,
    {
      skip,
      variables,
    }: { skip?: boolean; variables: QueryEntitySubgraphQueryVariables },
  ) => {
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
  graph.queries.length = 0;
  graph.writes.length = 0;
  graph.nextEntity = 1;
  graph.captureException.mockReset();
});
afterEach(cleanup);

const renderPointer = (processExists: boolean) =>
  renderHook(
    (props: { processExists: boolean }) =>
      useBrunchConversationPointer({ processEntityId, ...props }),
    { initialProps: { processExists } },
  );

const createdConversation = (conversationId: string) => ({
  kind: "createEntity",
  variables: expect.objectContaining({
    entityTypeIds: [systemEntityTypes.agentConversation.entityTypeId],
    webId: userWebId,
    properties: expect.objectContaining({
      value: {
        [conversationIdUrl]: expect.objectContaining({ value: conversationId }),
      },
    }),
  }),
});

const createdLink = (conversationEntityId: string) => ({
  kind: "createEntity",
  variables: expect.objectContaining({
    entityTypeIds: [systemLinkEntityTypes.hasSubject.linkEntityTypeId],
    webId: userWebId,
    linkData: {
      leftEntityId: conversationEntityId,
      rightEntityId: processEntityId,
    },
  }),
});

const updated = (entityId: string, conversationId: string) => ({
  kind: "updateEntity",
  variables: {
    entityUpdate: {
      entityId,
      propertyPatches: [
        expect.objectContaining({
          op: "add",
          path: [conversationIdUrl],
          property: expect.objectContaining({ value: conversationId }),
        }),
      ],
    },
  },
});

test("a saved process with nothing stored reads as none, and its first clear creates the entity and its link in the user's web; later clears update it", async () => {
  const { result, rerender } = renderPointer(true);
  // Still reading: Brunch binds nothing yet.
  expect(result.current.conversationId).toBeUndefined();
  expect(graph.queries.at(-1)?.skip).toBe(false);
  expect(JSON.stringify(graph.queries.at(-1)?.variables)).toContain(
    "00000000-0000-4000-8000-00000000000a",
  );

  graph.stored = [];
  rerender({ processExists: true });
  expect(result.current.conversationId).toBeNull();

  act(() => result.current.replace("cleared-1"));
  await waitFor(() => expect(graph.writes).toHaveLength(2));
  expect(graph.writes).toEqual([
    createdConversation("cleared-1"),
    createdLink(`${userWebId}~created-1`),
  ]);

  act(() => result.current.replace("cleared-2"));
  await waitFor(() => expect(graph.writes).toHaveLength(3));
  expect(graph.writes[2]).toEqual(
    updated(`${userWebId}~created-1`, "cleared-2"),
  );
  expect(graph.captureException).not.toHaveBeenCalled();
});

test("a stored conversation is read, the newest when there are two, and a clear updates that entity", async () => {
  graph.stored = [
    {
      entityId: `${userWebId}~older` as EntityId,
      conversationId: "older-conversation",
      createdAt: "2026-11-01T00:00:00.000Z",
    },
    {
      entityId: `${userWebId}~newer` as EntityId,
      conversationId: "newer-conversation",
      createdAt: "2026-11-02T00:00:00.000Z",
    },
  ];
  const { result } = renderPointer(true);
  expect(result.current.conversationId).toBe("newer-conversation");

  act(() => result.current.replace("cleared"));
  await waitFor(() => expect(graph.writes).toHaveLength(1));
  expect(graph.writes[0]).toEqual(updated(`${userWebId}~newer`, "cleared"));
});

test("a draft stores nothing until its first save creates the process, and stays bound across that save", async () => {
  const { result, rerender } = renderPointer(false);
  const seen = [result.current.conversationId];
  expect(graph.queries.every(({ skip }) => skip)).toBe(true);

  act(() => result.current.replace("cleared-on-draft"));
  await act(async () => {});
  expect(graph.writes).toEqual([]);

  // The first save lands. Nothing is read, so the conversation never unbinds.
  rerender({ processExists: true });
  seen.push(result.current.conversationId);
  await waitFor(() => expect(graph.writes).toHaveLength(2));
  seen.push(result.current.conversationId);
  expect(seen).toEqual([null, null, null]);
  expect(graph.queries.every(({ skip }) => skip)).toBe(true);
  expect(graph.writes).toEqual([
    createdConversation("cleared-on-draft"),
    createdLink(`${userWebId}~created-1`),
  ]);
});

test("the pointer keeps its identity while the stored conversation is unchanged", () => {
  graph.stored = [];
  const { result, rerender } = renderPointer(true);
  const first = result.current;
  rerender({ processExists: true });
  expect(result.current).toBe(first);
});
