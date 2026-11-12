import { useMutation, useQuery } from "@apollo/client";
import { use, useCallback, useEffect, useMemo, useRef } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { ErrorTrackerContext } from "@hashintel/petrinaut";
import {
  deserializeQueryEntitySubgraphResponse,
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  archiveEntitiesMutation,
  createEntityMutation,
  queryEntitySubgraphQuery,
} from "../../../../../../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../../../../../shared/auth-info-context";

import type {
  ArchiveEntitiesMutation,
  ArchiveEntitiesMutationVariables,
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { AgentConversation } from "@local/hash-isomorphic-utils/system-types/agentconversation";

const conversationIdBaseUrl =
  systemPropertyTypes.conversationId.propertyTypeBaseUrl;
const agentIdBaseUrl = systemPropertyTypes.agentId.propertyTypeBaseUrl;

/**
 * How long a conversation may stay without a subject before it counts as
 * left behind by a draft that was never saved.
 */
const abandonedAfterMs = 24 * 60 * 60 * 1000;

/** One `Agent Conversation` entity, as this page knows it. */
type KnownConversation = {
  entityId: EntityId;
  /** It is linked to its subject. A draft's conversation isn't until the draft is saved. */
  linked: boolean;
};

/**
 * The signed-in user's conversations with one agent, as `Agent Conversation`
 * entities in the user's own web, and which of them is open on one subject.
 * The agent keeps the messages; each entity is a conversation's handle in the
 * graph, so the open conversation follows the user to another browser, and an
 * archived entity says the conversation is over and its messages may go.
 *
 * - A conversation gets its entity when its first message is sent, linked to
 *   the subject. A draft's has no subject to link to until the draft's first
 *   save.
 * - Clearing creates the next conversation's entity. The earlier one stays,
 *   linked to the subject; the newest on a subject is the open one.
 * - When the page opens, it archives the user's conversations whose subject
 *   is archived, and those left without a subject for a day.
 *
 * Returns a stable object while the open conversation, as read, is unchanged.
 */
export const useAgentConversation = ({
  agentId,
  subjectEntityId,
  subjectExists,
}: {
  /** Names the agent, among every agent that keeps conversations in HASH. */
  agentId: string;
  /** What the conversation is about. */
  subjectEntityId: EntityId;
  /** The subject is saved. A draft's entity doesn't exist yet. */
  subjectExists: boolean;
}): {
  /** `undefined` while it is read, `null` when the subject has none open. */
  conversationId: string | null | undefined;
  /** A message was sent in this conversation. */
  start: (conversationId: string) => void;
  /** The user cleared the chat: this conversation is now the open one. */
  replace: (conversationId: string) => void;
} => {
  const { authenticatedUser } = useAuthInfo();
  const userWebId = (authenticatedUser?.accountId ?? null) as WebId | null;
  const { captureException } = use(ErrorTrackerContext);

  // Every open conversation the user has with this agent, read once when
  // the page opens. Not narrowed to the subject, so a draft's first save, or
  // opening another subject, reads nothing more and unbinds nothing.
  const { data, error } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
            { equal: [{ path: ["webId"] }, { parameter: userWebId }] },
            {
              equal: [
                { path: ["type", "versionedUrl"] },
                {
                  parameter: systemEntityTypes.agentConversation.entityTypeId,
                },
              ],
            },
            {
              equal: [
                { path: ["properties", agentIdBaseUrl] },
                { parameter: agentId },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        graphResolveDepths: { inheritsFrom: 0, isOfType: false },
        traversalPaths: [
          {
            edges: [
              { kind: "has-left-entity", direction: "incoming" },
              { kind: "has-right-entity", direction: "outgoing" },
            ],
          },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    skip: userWebId === null,
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (error) {
      captureException(error, { source: "agent-conversation.read" });
    }
  }, [error, captureException]);

  const read = useMemo(() => {
    if (!data) {
      return undefined;
    }
    const { subgraph } = deserializeQueryEntitySubgraphResponse(
      data.queryEntitySubgraph,
    );
    return getRoots(subgraph)
      .toSorted((a, b) =>
        b.metadata.provenance.createdAtDecisionTime.localeCompare(
          a.metadata.provenance.createdAtDecisionTime,
        ),
      )
      .flatMap((conversation) => {
        const conversationId = conversation.properties[conversationIdBaseUrl];
        if (typeof conversationId !== "string") {
          return [];
        }
        const { entityId } = conversation.metadata.recordId;
        const [link] = getOutgoingLinkAndTargetEntities(subgraph, entityId);
        return [
          {
            entityId,
            conversationId,
            createdAt: conversation.metadata.provenance.createdAtDecisionTime,
            /** What it is linked to. A draft's conversation is linked to nothing yet. */
            subjectEntityId: link?.linkEntity[0]?.linkData.rightEntityId,
            /**
             * The read returned the subject. It returns neither an archived
             * subject nor one the user can't see.
             */
            subjectSeen: link?.rightEntity?.[0] !== undefined,
          },
        ];
      });
  }, [data]);

  // Newest first, so two entities for one subject (two tabs) read as the newest.
  const openConversationId =
    read === undefined
      ? undefined
      : (read.find(
          (conversation) =>
            conversation.subjectSeen &&
            conversation.subjectEntityId === subjectEntityId,
        )?.conversationId ?? null);

  // Which of the subjects the read didn't return are archived, as opposed to
  // deleted or out of the user's sight: only those end their conversations.
  const unseenSubjectIds = useMemo(
    () => [
      ...new Set(
        (read ?? []).flatMap((conversation) =>
          conversation.subjectEntityId !== undefined &&
          !conversation.subjectSeen
            ? [conversation.subjectEntityId]
            : [],
        ),
      ),
    ],
    [read],
  );
  const { data: archivedSubjectsData, error: archivedSubjectsError } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
            {
              any: unseenSubjectIds.map((entityId) => ({
                equal: [
                  { path: ["uuid"] },
                  { parameter: extractEntityUuidFromEntityId(entityId) },
                ],
              })),
            },
            { equal: [{ path: ["archived"] }, { parameter: true }] },
          ],
        },
        graphResolveDepths: { inheritsFrom: 0, isOfType: false },
        traversalPaths: [],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    skip: unseenSubjectIds.length === 0,
    fetchPolicy: "network-only",
  });
  useEffect(() => {
    if (archivedSubjectsError) {
      captureException(archivedSubjectsError, {
        source: "agent-conversation.read-archived-subjects",
      });
    }
  }, [archivedSubjectsError, captureException]);
  const archivedSubjectIds = useMemo(
    () =>
      unseenSubjectIds.length === 0
        ? new Set<EntityId>()
        : archivedSubjectsData &&
          new Set(
            getRoots(
              deserializeQueryEntitySubgraphResponse(
                archivedSubjectsData.queryEntitySubgraph,
              ).subgraph,
            ).map((subject) => subject.metadata.recordId.entityId),
          ),
    [unseenSubjectIds, archivedSubjectsData],
  );

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);
  const [archiveEntities] = useMutation<
    ArchiveEntitiesMutation,
    ArchiveEntitiesMutationVariables
  >(archiveEntitiesMutation);

  /** The entities this page read or created, by conversation id. */
  const known = useRef(new Map<string, KnownConversation>());
  /**
   * The conversations this page has had on each subject. On a draft they are
   * unlinked, and this is the only record of what they are about.
   */
  const heldOn = useRef(new Map<EntityId, Set<string>>());
  const hold = useCallback((subject: EntityId, conversationId: string) => {
    const held = heldOn.current.get(subject) ?? new Set<string>();
    held.add(conversationId);
    heldOn.current.set(subject, held);
  }, []);
  useEffect(() => {
    for (const conversation of read ?? []) {
      const { conversationId, entityId } = conversation;
      if (!known.current.has(conversationId)) {
        known.current.set(conversationId, {
          entityId,
          linked: conversation.subjectEntityId !== undefined,
        });
      }
    }
  }, [read]);

  // The callbacks read these when called, so they keep one identity across a
  // draft's first save and the session built on them isn't rebuilt by it.
  const latest = useRef({ subjectEntityId, subjectExists, userWebId, agentId });
  useEffect(() => {
    latest.current = { subjectEntityId, subjectExists, userWebId, agentId };
  });

  /** Writes run one at a time, so two can't each create the same entity. */
  const writes = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback(
    (source: string, write: () => Promise<void>) => {
      writes.current = writes.current.then(write).catch((writeError: unknown) =>
        captureException(writeError, {
          source: `agent-conversation.${source}`,
        }),
      );
    },
    [captureException],
  );

  /**
   * Creates the conversation's entity if it has none, and links it to the
   * subject once the subject exists.
   */
  const record = useCallback(
    async (conversationId: string) => {
      const { userWebId: webId, agentId: agent } = latest.current;
      if (webId === null) {
        return;
      }
      const subject = latest.current.subjectEntityId;
      let conversation = known.current.get(conversationId);
      if (!conversation) {
        const created = await createEntity({
          variables: {
            entityTypeIds: [systemEntityTypes.agentConversation.entityTypeId],
            webId,
            properties: mergePropertyObjectAndMetadata<AgentConversation>(
              {
                "https://hash.ai/@h/types/property-type/conversation-id/":
                  conversationId,
                "https://hash.ai/@h/types/property-type/agent-id/": agent,
              },
              undefined,
            ),
          },
        });
        if (!created.data) {
          throw new Error("Creating the conversation returned no entity");
        }
        conversation = {
          entityId: new HashEntity(created.data.createEntity).metadata.recordId
            .entityId,
          linked: false,
        };
        known.current.set(conversationId, conversation);
      }
      // Read again: a draft's first save may have landed during the create.
      if (!conversation.linked && latest.current.subjectExists) {
        await createEntity({
          variables: {
            entityTypeIds: [systemLinkEntityTypes.hasSubject.linkEntityTypeId],
            webId,
            properties: mergePropertyObjectAndMetadata({}, undefined),
            linkData: {
              leftEntityId: conversation.entityId,
              rightEntityId: subject,
            },
          },
        });
        known.current.set(conversationId, { ...conversation, linked: true });
      }
    },
    [createEntity],
  );

  const start = useCallback(
    (conversationId: string) => {
      const { subjectEntityId: subject, subjectExists: exists } =
        latest.current;
      hold(subject, conversationId);
      const conversation = known.current.get(conversationId);
      // Called for every message: only the first has anything to write.
      if (conversation && (conversation.linked || !exists)) {
        return;
      }
      enqueue("start", () => record(conversationId));
    },
    [enqueue, hold, record],
  );

  // Clearing starts the next conversation. The one before it is left as it
  // is: starting afresh doesn't say the earlier conversation may be discarded.
  // The newest conversation on a subject is the open one, so the new entity
  // is created now, before any message, for another browser to read.
  const replace = useCallback(
    (conversationId: string) => {
      hold(latest.current.subjectEntityId, conversationId);
      enqueue("replace", () => record(conversationId));
    },
    [enqueue, hold, record],
  );

  // A draft's conversations are linked once the draft's first save has
  // created their subject.
  useEffect(() => {
    if (!subjectExists) {
      return;
    }
    for (const conversationId of heldOn.current.get(subjectEntityId) ?? []) {
      if (known.current.get(conversationId)?.linked === false) {
        enqueue("link", () => record(conversationId));
      }
    }
  }, [subjectExists, subjectEntityId, enqueue, record]);

  // Once per read: end the conversations nothing will open again.
  useEffect(() => {
    if (!read || !archivedSubjectIds) {
      return;
    }
    const now = Date.now();
    const ended = read.filter((conversation) =>
      conversation.subjectEntityId !== undefined
        ? // Its subject is archived. One deleted, or out of the user's sight, is left alone.
          archivedSubjectIds.has(conversation.subjectEntityId)
        : // Left by a draft that was never saved, unless it is the draft open now.
          now - Date.parse(conversation.createdAt) > abandonedAfterMs &&
          heldOn.current
            .get(latest.current.subjectEntityId)
            ?.has(conversation.conversationId) !== true,
    );
    if (ended.length === 0) {
      return;
    }
    enqueue("clean-up", async () => {
      await archiveEntities({
        variables: { entityIds: ended.map(({ entityId }) => entityId) },
      });
      for (const { conversationId } of ended) {
        known.current.delete(conversationId);
      }
    });
  }, [read, archivedSubjectIds, archiveEntities, enqueue]);

  return useMemo(
    () => ({ conversationId: openConversationId, start, replace }),
    [openConversationId, start, replace],
  );
};
