import { useMutation, useQuery } from "@apollo/client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { ErrorTrackerContext } from "@hashintel/petrinaut";
import {
  deserializeQueryEntitySubgraphResponse,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import {
  createEntityMutation,
  queryEntitySubgraphQuery,
} from "../../../../../../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../../../../../shared/auth-info-context";
import { creatableWebIds } from "../../../draft-query";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";
import type { BrunchConversationPointer } from "@hashintel/brunch-agent/ui";
import type { AgentConversation } from "@local/hash-isomorphic-utils/system-types/agentconversation";

const agentIdBaseUrl = systemPropertyTypes.agentId.propertyTypeBaseUrl;
const focusLinkTypeId =
  systemLinkEntityTypes.hasAgentConversationFocus.linkEntityTypeId;

/** How long each retry of a failed read waits. */
export const readRetryDelaysMs = [1_000, 2_000, 4_000] as const;

/**
 * One conversation's entity and its link to its subject, as they were when
 * the write was asked for. It is kept until both exist, so a write that
 * fails is tried again with the same entity rather than a second one.
 */
type ConversationWrite = {
  conversationId: string;
  agentId: string;
  subjectEntityId: EntityId;
  webId: WebId;
  entityUuid: EntityUuid;
  /** The conversation's entity has been created. */
  created: boolean;
  /**
   * Creating the conversation's entity has been asked for before, so it may
   * exist even if that attempt failed: its answer may have been lost.
   */
  attempted: boolean;
};

/**
 * The signed-in user's conversations with one agent on one entity, its
 * subject, and which of them is open. Each is an `Agent Conversation` entity
 * created by the user, with a `Has Agent Conversation Focus` link to the
 * subject. The agent keeps the messages; the entity is the conversation's
 * handle in the graph, so the open conversation follows the user to another
 * browser.
 *
 * - The open conversation is the newest of the user's unarchived ones linked
 *   to the subject, in any web. Other members' conversations are left out by
 *   the read itself, since a web admin may see them.
 * - A conversation gets its entity and link when its first message is sent,
 *   unless this page already knows one for it. They go in the subject's web
 *   if the user can create entities there, and otherwise in the user's own.
 * - Clearing creates the next conversation's entity and link, before any
 *   message, so another browser opens it. The earlier one stays as it is.
 * - While the subject is an unsaved draft, nothing is written: the graph
 *   can't link to an entity that doesn't exist yet. The conversations started
 *   on it are kept here, in order, and written at once when it is saved, so
 *   the open one is still the newest. Leaving the draft unsaved drops them.
 * - A write that fails is tried again by the conversation's next message,
 *   with the same entity: a conversation whose entity was created but not its
 *   link goes on to the link, rather than being left unreachable.
 * - A read that fails, or is retried and answers without data, is tried
 *   again {@link readRetryDelaysMs}`.length` times. If none succeeds, the
 *   subject has no open conversation, so its next message starts one rather
 *   than leaving the agent unusable.
 *
 * Each write records the agent, web and subject as they were when it was
 * asked for, and writes run one at a time.
 *
 * Returns a stable object while the open conversation, as read, is unchanged.
 */
export const useAgentConversation = ({
  agentId,
  subjectEntityId,
  subjectSaved,
}: {
  /** Names the agent and the service that keeps its conversations. */
  agentId: string;
  /**
   * The entity the conversation focuses on, such as the open process. A
   * draft's is the one its first save creates.
   */
  subjectEntityId: EntityId;
  /** The subject exists in the graph: it is not an unsaved draft. */
  subjectSaved: boolean;
}): BrunchConversationPointer => {
  const { authenticatedUser } = useAuthInfo();
  const userId = authenticatedUser?.accountId ?? null;
  const { captureException } = use(ErrorTrackerContext);

  // Keyed by their ids, as the user object may be new on every render.
  const creatableWebsKey = authenticatedUser
    ? [...creatableWebIds(authenticatedUser)].join(",")
    : "";
  const creatableWebs = useMemo(
    () => new Set(creatableWebsKey.split(",")),
    [creatableWebsKey],
  );

  const { data, error, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
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
            { equal: [{ path: ["createdById"] }, { parameter: userId }] },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
            // The graph matches these against one and the same link.
            {
              equal: [
                { path: ["outgoingLinks", "type", "versionedUrl"] },
                { parameter: focusLinkTypeId },
              ],
            },
            {
              equal: [
                { path: ["outgoingLinks", "archived"] },
                { parameter: false },
              ],
            },
            {
              equal: [
                { path: ["outgoingLinks", "rightEntity", "webId"] },
                { parameter: extractWebIdFromEntityId(subjectEntityId) },
              ],
            },
            {
              equal: [
                { path: ["outgoingLinks", "rightEntity", "uuid"] },
                {
                  parameter: extractEntityUuidFromEntityId(subjectEntityId),
                },
              ],
            },
          ],
        },
        graphResolveDepths: { inheritsFrom: 0, isOfType: false },
        traversalPaths: [],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    skip: userId === null,
    fetchPolicy: "network-only",
  });

  /** The failed reads of this subject: the first and each retry. */
  const readKey = `${userId}/${agentId}/${subjectEntityId}`;
  const [readFailures, setReadFailures] = useState({ readKey, count: 0 });
  const failedReads = readFailures.readKey === readKey ? readFailures.count : 0;

  useEffect(() => {
    if (error && failedReads === 0) {
      captureException(error, { source: "agent-conversation.read" });
      setReadFailures({ readKey, count: 1 });
    }
  }, [error, failedReads, readKey, captureException]);

  useEffect(() => {
    const delayMs = readRetryDelaysMs[failedReads - 1];
    if (delayMs === undefined) {
      return;
    }
    const timer = setTimeout(() => {
      refetch().then(
        ({ data: retried }) => {
          // A later failure of this read starts its retries afresh.
          setReadFailures({
            readKey,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `refetch()` can resolve without `data`
            count: retried ? 0 : failedReads + 1,
          });
        },
        (retryError: unknown) => {
          captureException(retryError, { source: "agent-conversation.read" });
          setReadFailures({ readKey, count: failedReads + 1 });
        },
      );
    }, delayMs);
    return () => clearTimeout(timer);
  }, [failedReads, readKey, refetch, captureException]);

  /** The conversation ids read, newest first. */
  const readConversationIds = useMemo(() => {
    if (!data) {
      return undefined;
    }
    const { subgraph } =
      deserializeQueryEntitySubgraphResponse<AgentConversation>(
        data.queryEntitySubgraph,
      );
    return getRoots(subgraph)
      .toSorted((left, right) =>
        right.metadata.provenance.createdAtDecisionTime.localeCompare(
          left.metadata.provenance.createdAtDecisionTime,
        ),
      )
      .map(
        (conversation) =>
          simplifyProperties(conversation.properties).conversationId,
      );
  }, [data]);

  const unreadable =
    readConversationIds === undefined && failedReads > readRetryDelaysMs.length;

  // Newest first, so two entities on one subject (two tabs) read as the newest.
  const openConversationId = unreadable
    ? null
    : readConversationIds === undefined
      ? undefined
      : (readConversationIds[0] ?? null);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  /**
   * The conversations this page read, or wrote or is writing, an entity and
   * link for.
   */
  const known = useRef(new Set<string>());
  useEffect(() => {
    for (const conversationId of readConversationIds ?? []) {
      known.current.add(conversationId);
    }
  }, [readConversationIds]);

  /** Writes that failed, by conversation, for its next message to finish. */
  const unfinished = useRef(new Map<string, ConversationWrite>());

  /** Writes run one at a time, so two can't each create the same entity. */
  const writes = useRef<Promise<void>>(Promise.resolve());

  const writeConversation = useCallback(
    async (write: ConversationWrite) => {
      const conversationEntityId = entityIdFromComponents(
        write.webId,
        write.entityUuid,
      );
      if (!write.created) {
        const retry = write.attempted;
        // eslint-disable-next-line no-param-reassign -- the write's record is kept across attempts
        write.attempted = true;
        try {
          const created = await createEntity({
            variables: {
              entityTypeIds: [systemEntityTypes.agentConversation.entityTypeId],
              webId: write.webId,
              entityUuid: write.entityUuid,
              properties: mergePropertyObjectAndMetadata<AgentConversation>(
                {
                  "https://hash.ai/@h/types/property-type/conversation-id/":
                    write.conversationId,
                  "https://hash.ai/@h/types/property-type/agent-id/":
                    write.agentId,
                },
                undefined,
              ),
            },
          });
          if (!created.data) {
            throw new Error("Creating the conversation returned no entity");
          }
          // eslint-disable-next-line no-param-reassign -- the write's record is kept across attempts
          write.created = true;
        } catch (createError) {
          // An earlier attempt may have created it, so it is taken now. If
          // it wasn't, the link is refused too, and the write stays
          // unfinished.
          if (!retry) {
            throw createError;
          }
        }
      }
      const linked = await createEntity({
        variables: {
          entityTypeIds: [focusLinkTypeId],
          webId: write.webId,
          properties: mergePropertyObjectAndMetadata({}, undefined),
          linkData: {
            leftEntityId: conversationEntityId,
            rightEntityId: write.subjectEntityId,
          },
        },
      });
      if (!linked.data) {
        throw new Error("Linking the conversation returned no entity");
      }
    },
    [createEntity],
  );

  // Everything the write records is taken now, when it is asked for: the hook
  // stays mounted as the user moves between processes, and a write queued on
  // one must not be recorded against the next.
  const enqueue = useCallback(
    (source: string, conversationId: string) => {
      if (known.current.has(conversationId)) {
        return;
      }
      known.current.add(conversationId);
      const subjectWebId = extractWebIdFromEntityId(subjectEntityId);
      const write = unfinished.current.get(conversationId) ?? {
        conversationId,
        agentId,
        subjectEntityId,
        webId:
          userId !== null && !creatableWebs.has(subjectWebId)
            ? userId
            : subjectWebId,
        entityUuid: generateUuid() as EntityUuid,
        created: false,
        attempted: false,
      };
      unfinished.current.delete(conversationId);
      writes.current = writes.current
        .then(() => writeConversation(write))
        .catch((writeError: unknown) => {
          // Not recorded, so its next message tries again.
          known.current.delete(conversationId);
          unfinished.current.set(conversationId, write);
          captureException(writeError, {
            source: `agent-conversation.${source}`,
          });
        });
    },
    [
      agentId,
      subjectEntityId,
      userId,
      creatableWebs,
      writeConversation,
      captureException,
    ],
  );

  /**
   * The conversations started on each unsaved draft, by its id, in the order
   * they were, to write when it is saved.
   */
  const unsaved = useRef(
    new Map<EntityId, { source: string; conversationId: string }[]>(),
  );

  const record = useCallback(
    (source: string, conversationId: string) => {
      if (subjectSaved) {
        enqueue(source, conversationId);
        return;
      }
      const intents = unsaved.current.get(subjectEntityId) ?? [];
      if (!intents.some((intent) => intent.conversationId === conversationId)) {
        intents.push({ source, conversationId });
      }
      unsaved.current.set(subjectEntityId, intents);
    },
    [subjectSaved, subjectEntityId, enqueue],
  );

  // Once the draft is saved, its conversations are written at once, in order.
  useEffect(() => {
    const intents = unsaved.current.get(subjectEntityId);
    if (!subjectSaved || !intents) {
      return;
    }
    unsaved.current.delete(subjectEntityId);
    for (const { source, conversationId } of intents) {
      enqueue(source, conversationId);
    }
  }, [subjectSaved, subjectEntityId, enqueue]);

  // Leaving a draft unsaved drops its conversations: they are never written.
  useEffect(() => {
    const pending = unsaved.current;
    return () => {
      pending.delete(subjectEntityId);
    };
  }, [subjectEntityId]);

  // Called for every message: only the first has anything to write.
  const start = useCallback(
    (conversationId: string) => record("start", conversationId),
    [record],
  );

  // Clearing starts the next conversation. The one before it is left as it
  // is: starting afresh doesn't say the earlier conversation may be discarded.
  // The newest conversation on a subject is the open one, so the new entity
  // is created now, before any message, for another browser to read.
  const replace = useCallback(
    (conversationId: string) => record("replace", conversationId),
    [record],
  );

  return useMemo(
    () => ({ conversationId: openConversationId, start, replace }),
    [openConversationId, start, replace],
  );
};
