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
/** A web the user can create entities in: an org they are a member of. */
const processWebId = "00000000-0000-4000-8000-000000000001";
/** A web the user can only view. */
const otherWebId = "00000000-0000-4000-8000-000000000002";
const processId =
  `${processWebId}~00000000-0000-4000-8000-00000000000a` as EntityId;
const otherProcessId =
  `${processWebId}~00000000-0000-4000-8000-00000000000b` as EntityId;
/** A draft in the process's web, whose first save creates it with this id. */
const draftId =
  `${processWebId}~00000000-0000-4000-8000-00000000000d` as EntityId;
/** A process in a web the user can't create entities in. */
const elsewhereProcessId =
  `${otherWebId}~00000000-0000-4000-8000-00000000000c` as EntityId;
const agentId = "test-agent";
const conversationIdUrl =
  systemPropertyTypes.conversationId.propertyTypeBaseUrl;
const agentIdUrl = systemPropertyTypes.agentId.propertyTypeBaseUrl;
const focusTypeId =
  systemLinkEntityTypes.hasAgentConversationFocus.linkEntityTypeId;

/** One `Agent Conversation` entity in the fake graph. */
type StoredConversation = {
  entityId: EntityId;
  conversationId: string;
  agentId: string;
  createdById: string;
  createdAt: string;
  archived: boolean;
};

/** One `Has Agent Conversation Focus` link in the fake graph. */
type StoredLink = {
  entityId: EntityId;
  leftEntityId: EntityId;
  rightEntityId: EntityId;
  archived: boolean;
};

/** A write the fake graph fails: refused, or applied with its answer lost. */
type WriteFailure = {
  kind: "conversation" | "link";
  lost?: boolean;
};

/**
 * The graph as these tests see it. Reads are answered by applying the read's
 * own filter to every stored conversation, the way the graph would answer a
 * web admin, who can see every member's conversations.
 */
const graph = vi.hoisted(() => ({
  stored: [] as StoredConversation[],
  links: [] as StoredLink[],
  /** The next writes of each kind to fail, in order. */
  writeFailures: [] as WriteFailure[],
  /** The read is in flight. */
  reading: false,
  /** How many of the next reads, first or retried, fail. */
  failingReads: 0,
  /** How many of the next retries resolve without data, as Apollo's can. */
  emptyRetries: 0,
  /** The reads whose last attempt failed. */
  failed: new Set<string>(),
  /** The answers this page has had, by read, as Apollo keeps them. */
  answers: new Map<string, unknown>(),
  queries: [] as { skip: boolean; variables: unknown }[],
  writes: [] as {
    kind: "conversation" | "link";
    variables: Record<string, unknown>;
  }[],
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
  // A new object on every render, as the user may be.
  useAuthInfo: () => ({
    authenticatedUser: {
      accountId,
      memberOf: [{ org: { webId: processWebId } }],
    },
  }),
}));

vi.mock("@apollo/client", async (importOriginal) => {
  const original = await importOriginal<typeof ApolloClient>();
  const { useCallback, useReducer, useRef } = await import("react");

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
    if (root === "createdById") {
      return conversation.createdById;
    }
    if (root === "archived") {
      return conversation.archived;
    }
    throw new Error(`The fake graph can't filter on ${path.join(".")}`);
  };

  const linkValueAt = (link: StoredLink, path: string[]) => {
    const [root, key] = path;
    if (root === "type" && key === "versionedUrl") {
      return focusTypeId;
    }
    if (root === "archived") {
      return link.archived;
    }
    if (root === "rightEntity" && key === "webId") {
      return link.rightEntityId.split("~")[0];
    }
    if (root === "rightEntity" && key === "uuid") {
      return link.rightEntityId.split("~")[1];
    }
    throw new Error(
      `The fake graph can't filter on outgoingLinks.${path.join(".")}`,
    );
  };

  const isLinkClause = (clause: Clause) =>
    clause.equal?.[0].path[0] === "outgoingLinks";

  /**
   * As the graph does, the clauses on `outgoingLinks` in one `all` hold of one
   * and the same link.
   */
  const matches = (
    conversation: StoredConversation,
    clause: Clause,
  ): boolean => {
    if (clause.all) {
      const linkClauses = clause.all.filter(isLinkClause);
      return (
        clause.all
          .filter((inner) => !isLinkClause(inner))
          .every((inner) => matches(conversation, inner)) &&
        (linkClauses.length === 0 ||
          graph.links.some(
            (link) =>
              link.leftEntityId === conversation.entityId &&
              linkClauses.every(({ equal }) => {
                const [{ path }, { parameter }] = equal!;
                return linkValueAt(link, path.slice(1)) === parameter;
              }),
          ))
      );
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

  const readError = new Error("The read failed");
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
    const read = () => {
      // Answered once per read, and the same object after, as Apollo's is: a
      // write isn't seen until the page reads again.
      if (!graph.answers.has(key)) {
        const filter = variables.request.filter as Clause;
        graph.answers.set(
          key,
          answer(
            graph.stored.filter((conversation) =>
              matches(conversation, filter),
            ),
          ),
        );
      }
      return graph.answers.get(key);
    };
    const retry = () => {
      if (graph.failingReads > 0) {
        graph.failingReads--;
        return Promise.reject(new Error("The read failed again"));
      }
      if (graph.emptyRetries > 0) {
        graph.emptyRetries--;
        return Promise.resolve({ data: undefined });
      }
      graph.failed.delete(key);
      const data = read();
      rerender();
      return Promise.resolve({ data });
    };
    // Stable across renders, as Apollo's is.
    const latestRetry = useRef(retry);
    latestRetry.current = retry;
    const refetch = useCallback(() => latestRetry.current(), []);
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
    return { data: read(), error: undefined, refetch };
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
    if (kind !== "createEntity") {
      throw new Error(`Unexpected mutation ${kind}`);
    }
    const mutate = [
      async ({ variables }: { variables: Record<string, unknown> }) => {
        const linkData = variables.linkData as
          | { leftEntityId: EntityId; rightEntityId: EntityId }
          | undefined;
        const writeKind = linkData ? "link" : "conversation";
        graph.writes.push({ kind: writeKind, variables });
        await graph.gate;
        const failureIndex = graph.writeFailures.findIndex(
          (failure) => failure.kind === writeKind,
        );
        const failure =
          failureIndex === -1
            ? undefined
            : graph.writeFailures.splice(failureIndex, 1)[0];
        if (failure && !failure.lost) {
          throw new Error(`The ${writeKind} write failed`);
        }
        const webId = variables.webId as string;
        const entityUuid =
          (variables.entityUuid as string | undefined) ??
          `created-${graph.nextEntity}`;
        const entityId = `${webId}~${entityUuid}` as EntityId;
        if (
          graph.stored.some((stored) => stored.entityId === entityId) ||
          graph.links.some((link) => link.entityId === entityId)
        ) {
          throw new Error(`The entity ${entityId} already exists`);
        }
        if (linkData) {
          if (
            !graph.stored.some(
              (stored) => stored.entityId === linkData.leftEntityId,
            )
          ) {
            throw new Error("The link's left entity doesn't exist");
          }
          graph.links.push({ entityId, ...linkData, archived: false });
        } else {
          const { value } = variables.properties as {
            value: Record<string, { value: string }>;
          };
          graph.stored.push({
            entityId,
            conversationId: value[conversationIdUrl]?.value ?? "",
            agentId: value[agentIdUrl]?.value ?? "",
            createdById: accountId,
            createdAt: `2027-01-01T00:00:${String(graph.nextEntity).padStart(2, "0")}.000Z`,
            archived: false,
          });
        }
        graph.nextEntity++;
        if (failure?.lost) {
          throw new Error(`The ${writeKind} write's answer was lost`);
        }
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
  graph.links = [];
  graph.writeFailures = [];
  graph.reading = false;
  graph.failingReads = 0;
  graph.emptyRetries = 0;
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

const renderConversation = (
  subjectEntityId: EntityId = processId,
  subjectSaved = true,
) =>
  renderHook<
    ReturnType<typeof useAgentConversation>,
    { subjectEntityId: EntityId; subjectSaved?: boolean }
  >(
    (props) => useAgentConversation({ agentId, subjectSaved: true, ...props }),
    { initialProps: { subjectEntityId, subjectSaved } },
  );

/** Opens the page again, in this browser or another: everything is read afresh. */
const reload = (subjectEntityId: EntityId = processId) => {
  cleanup();
  graph.answers.clear();
  return renderConversation(subjectEntityId);
};

/**
 * Stores a conversation, by default in the process's web, linked to the
 * process.
 */
const store = (
  name: string,
  {
    subjectEntityId = processId,
    linkArchived = false,
    webId = processWebId,
    ...overrides
  }: Partial<StoredConversation> & {
    subjectEntityId?: EntityId | null;
    linkArchived?: boolean;
    webId?: string;
  } = {},
) => {
  const conversation: StoredConversation = {
    entityId: `${webId}~${name}` as EntityId,
    conversationId: `${name}-conversation`,
    agentId,
    createdById: accountId,
    createdAt: "2026-11-10T00:00:00.000Z",
    archived: false,
    ...overrides,
  };
  graph.stored.push(conversation);
  if (subjectEntityId) {
    graph.links.push({
      entityId: `${webId}~${name}-focus` as EntityId,
      leftEntityId: conversation.entityId,
      rightEntityId: subjectEntityId,
      archived: linkArchived,
    });
  }
};

const createdConversation = (conversationId: string, webId: string) => ({
  kind: "conversation",
  variables: expect.objectContaining({
    entityTypeIds: [systemEntityTypes.agentConversation.entityTypeId],
    webId,
    entityUuid: expect.any(String),
    properties: expect.objectContaining({
      value: {
        [conversationIdUrl]: expect.objectContaining({ value: conversationId }),
        [agentIdUrl]: expect.objectContaining({ value: agentId }),
      },
    }),
  }),
});

const createdFocus = (subjectEntityId: EntityId, webId: string) => ({
  kind: "link",
  variables: expect.objectContaining({
    entityTypeIds: [focusTypeId],
    webId,
    linkData: {
      leftEntityId: expect.stringMatching(new RegExp(`^${webId}~`, "u")),
      rightEntityId: subjectEntityId,
    },
  }),
});

/** A conversation's entity, and its link to its subject from that entity. */
const created = (
  conversationId: string,
  subjectEntityId: EntityId,
  webId: string,
) => [
  createdConversation(conversationId, webId),
  createdFocus(subjectEntityId, webId),
];

/** Lets queued writes settle. */
const settle = () => act(async () => {});

test("the open conversation is the user's newest with this agent linked to this subject, in any web", () => {
  store("older", { createdAt: "2026-11-01T00:00:00.000Z" });
  store("newer", {
    createdAt: "2026-11-02T00:00:00.000Z",
    webId: accountId,
  });
  store("archived", {
    createdAt: "2026-11-03T00:00:00.000Z",
    archived: true,
  });
  store("other-agent", {
    createdAt: "2026-11-04T00:00:00.000Z",
    agentId: "another-agent",
  });
  store("elsewhere", {
    createdAt: "2026-11-05T00:00:00.000Z",
    subjectEntityId: otherProcessId,
  });
  store("unlinked", {
    createdAt: "2026-11-06T00:00:00.000Z",
    subjectEntityId: null,
  });
  store("link-archived", {
    createdAt: "2026-11-07T00:00:00.000Z",
    linkArchived: true,
  });
  graph.reading = true;
  const { result, rerender } = renderConversation();
  // Still reading: nothing binds yet.
  expect(result.current.conversationId).toBeUndefined();

  graph.reading = false;
  rerender({ subjectEntityId: processId });
  expect(result.current.conversationId).toBe("newer-conversation");

  rerender({ subjectEntityId: otherProcessId });
  expect(result.current.conversationId).toBe("elsewhere-conversation");
});

test("another member's conversation on the same subject, which a web admin's read could return, is not opened", () => {
  store("mine", { createdAt: "2026-11-01T00:00:00.000Z" });
  store("theirs", {
    createdAt: "2026-11-02T00:00:00.000Z",
    createdById: otherAccountId,
  });
  const { result } = renderConversation();
  expect(result.current.conversationId).toBe("mine-conversation");

  graph.stored = [];
  graph.links = [];
  store("theirs", { createdById: otherAccountId });
  const { result: reloaded } = reload();
  expect(reloaded.current.conversationId).toBeNull();
});

test("a conversation's first message creates its entity and its link to the subject in the subject's web, and later messages write nothing", async () => {
  const { result } = renderConversation();
  expect(result.current.conversationId).toBeNull();

  act(() => result.current.start("first"));
  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toEqual(created("first", processId, processWebId));
  expect(graph.links[0]?.leftEntityId).toBe(graph.stored[0]?.entityId);

  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toHaveLength(2);
  expect(graph.captureException).not.toHaveBeenCalled();

  // Read again, it is the open one.
  const { result: reloaded } = reload();
  expect(reloaded.current.conversationId).toBe("first");
});

test("on a subject in a web the user can't create entities in, the conversation and its link go in the user's own web", async () => {
  const { result } = renderConversation(elsewhereProcessId);
  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toEqual(created("first", elsewhereProcessId, accountId));

  const { result: reloaded } = reload(elsewhereProcessId);
  expect(reloaded.current.conversationId).toBe("first");
});

test("a message in a conversation that already has its entity writes nothing", async () => {
  store("open");
  const { result } = renderConversation();
  act(() => result.current.start("open-conversation"));
  await settle();
  expect(graph.writes).toEqual([]);
});

test("clearing creates the next conversation's entity and link, which becomes the open one, and leaves the earlier one as it is", async () => {
  store("open");
  const { result } = renderConversation();

  act(() => result.current.replace("next"));
  await settle();
  expect(graph.writes).toEqual(created("next", processId, processWebId));

  // Its messages then write nothing more.
  act(() => result.current.start("next"));
  await settle();
  expect(graph.writes).toHaveLength(2);

  const { result: reloaded } = reload();
  expect(reloaded.current.conversationId).toBe("next");
  expect(graph.stored.map(({ archived }) => archived)).toEqual([false, false]);
});

test("a write queued on one subject is recorded against it after the user moves to another, and writes run one at a time", async () => {
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

  rerender({ subjectEntityId: elsewhereProcessId });
  act(() => result.current.start("on-b"));
  release();
  await waitFor(() => expect(graph.writes).toHaveLength(6));
  expect(graph.writes).toEqual([
    ...created("on-a", processId, processWebId),
    ...created("cleared-on-a", processId, processWebId),
    ...created("on-b", elsewhereProcessId, accountId),
  ]);
});

test("when the link's write fails, the next message writes the link from the same entity, and no second entity", async () => {
  graph.writeFailures = [{ kind: "link" }];
  const { result } = renderConversation();
  act(() => result.current.start("first"));
  await settle();
  expect(graph.stored).toHaveLength(1);
  expect(graph.links).toHaveLength(0);
  expect(graph.captureException).toHaveBeenCalledTimes(1);

  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toEqual([
    ...created("first", processId, processWebId),
    createdFocus(processId, processWebId),
  ]);
  expect(graph.stored).toHaveLength(1);
  expect(graph.links).toEqual([
    expect.objectContaining({
      leftEntityId: graph.stored[0]?.entityId,
      rightEntityId: processId,
    }),
  ]);

  // Done: later messages write nothing.
  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toHaveLength(3);

  const { result: reloaded } = reload();
  expect(reloaded.current.conversationId).toBe("first");
});

test("when the entity's write fails, the next message writes it again under the same id, then its link", async () => {
  graph.writeFailures = [{ kind: "conversation" }];
  const { result } = renderConversation();
  act(() => result.current.start("first"));
  await settle();
  expect(graph.stored).toHaveLength(0);
  // The link is not tried without its entity.
  expect(graph.writes).toEqual([createdConversation("first", processWebId)]);

  act(() => result.current.start("first"));
  await settle();
  expect(graph.writes).toEqual([
    createdConversation("first", processWebId),
    ...created("first", processId, processWebId),
  ]);
  expect(graph.writes[1]?.variables.entityUuid).toBe(
    graph.writes[0]?.variables.entityUuid,
  );
  expect(graph.stored).toHaveLength(1);
  expect(graph.links).toHaveLength(1);
});

test("when the entity was written but its answer was lost, the next message goes on to the link, and no second entity", async () => {
  graph.writeFailures = [{ kind: "conversation", lost: true }];
  const { result } = renderConversation();
  act(() => result.current.start("first"));
  await settle();
  expect(graph.stored).toHaveLength(1);
  expect(graph.links).toHaveLength(0);

  act(() => result.current.start("first"));
  await settle();
  // The entity's write is refused, as its id is taken, and the link follows.
  expect(graph.stored).toHaveLength(1);
  expect(graph.links).toEqual([
    expect.objectContaining({
      leftEntityId: graph.stored[0]?.entityId,
      rightEntityId: processId,
    }),
  ]);

  const { result: reloaded } = reload();
  expect(reloaded.current.conversationId).toBe("first");
});

test("on an unsaved draft nothing is written, however many messages are sent", async () => {
  const { result } = renderConversation(draftId, false);
  expect(result.current.conversationId).toBeNull();

  act(() => result.current.start("first"));
  act(() => result.current.start("first"));
  act(() => result.current.replace("second"));
  await settle();
  expect(graph.writes).toEqual([]);
  expect(graph.captureException).not.toHaveBeenCalled();
});

test("when the draft is saved, its conversations are written at once, in the order they were started, each with its link", async () => {
  const { result, rerender } = renderConversation(draftId, false);
  act(() => result.current.start("first"));
  act(() => result.current.replace("second"));
  act(() => result.current.start("second"));
  await settle();
  expect(graph.writes).toEqual([]);

  // Its first save: no message is needed to write them.
  rerender({ subjectEntityId: draftId, subjectSaved: true });
  await settle();
  expect(graph.writes).toEqual([
    ...created("first", draftId, processWebId),
    ...created("second", draftId, processWebId),
  ]);

  // Their later messages write nothing more.
  act(() => result.current.start("second"));
  await settle();
  expect(graph.writes).toHaveLength(4);

  // The newest is the open one.
  const { result: reloaded } = reload(draftId);
  expect(reloaded.current.conversationId).toBe("second");
});

test("a draft that a Create finds saved by another tab has its conversations written when the editor switches to it", async () => {
  // Another tab saved the draft, and started a conversation on it there.
  store("other-tab", {
    subjectEntityId: draftId,
    createdAt: "2026-11-01T00:00:00.000Z",
  });
  const { result, rerender } = renderConversation(draftId, false);
  act(() => result.current.start("this-tab"));
  await settle();
  expect(graph.writes).toEqual([]);

  // The Create is refused, and the editor switches to the saved net.
  rerender({ subjectEntityId: draftId, subjectSaved: true });
  await settle();
  expect(graph.writes).toEqual(created("this-tab", draftId, processWebId));

  const { result: reloaded } = reload(draftId);
  expect(reloaded.current.conversationId).toBe("this-tab");
});

test("leaving an unsaved draft drops its conversations, which are not written against the next process or the draft later", async () => {
  const { result, rerender } = renderConversation(draftId, false);
  act(() => result.current.start("on-draft"));
  await settle();

  rerender({ subjectEntityId: processId, subjectSaved: true });
  await settle();
  expect(graph.writes).toEqual([]);

  act(() => result.current.start("on-process"));
  await settle();
  expect(graph.writes).toEqual(created("on-process", processId, processWebId));

  // The draft is saved later, as from its URL in another tab: nothing it
  // had here is written.
  rerender({ subjectEntityId: draftId, subjectSaved: true });
  await settle();
  expect(graph.writes).toHaveLength(2);
});

test("a read that fails is tried again, and opens what the retry reads", async () => {
  vi.useFakeTimers();
  try {
    store("open");
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

test("when every retry fails the subject has no open conversation, and its first message creates one", async () => {
  vi.useFakeTimers();
  try {
    store("unreachable");
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
    expect(graph.writes).toEqual(created("fresh", processId, processWebId));
  } finally {
    vi.useRealTimers();
  }
});

test("a retry that answers without data counts as a failed read", async () => {
  vi.useFakeTimers();
  try {
    store("unreachable");
    graph.failingReads = 1;
    graph.emptyRetries = readRetryDelaysMs.length;
    const { result } = renderConversation();

    for (const delayMs of readRetryDelaysMs) {
      expect(result.current.conversationId).toBeUndefined();
      await act(() => vi.advanceTimersByTimeAsync(delayMs));
    }
    expect(result.current.conversationId).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("a read that fails after a retry succeeded is tried again", async () => {
  vi.useFakeTimers();
  try {
    store("open");
    graph.failingReads = 1;
    const { result, rerender } = renderConversation();
    await act(() => vi.advanceTimersByTimeAsync(readRetryDelaysMs[0]));
    expect(result.current.conversationId).toBe("open-conversation");

    // Apollo reads again, and that read fails.
    graph.answers.clear();
    graph.failingReads = 1;
    rerender({ subjectEntityId: processId });
    expect(result.current.conversationId).toBeUndefined();

    await act(() => vi.advanceTimersByTimeAsync(readRetryDelaysMs[0]));
    expect(result.current.conversationId).toBe("open-conversation");
  } finally {
    vi.useRealTimers();
  }
});

test("the result keeps its identity while the open conversation, as read, is unchanged", () => {
  const { result, rerender } = renderConversation();
  const first = result.current;
  rerender({ subjectEntityId: processId });
  expect(result.current).toBe(first);
});
