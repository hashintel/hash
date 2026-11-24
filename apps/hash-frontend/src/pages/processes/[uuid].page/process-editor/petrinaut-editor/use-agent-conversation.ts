import { useMutation, useQuery } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
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
} from "../../../../../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../../../../shared/auth-info-context";
import { creatableWebIds } from "../../draft-query";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";
import type { BrunchConversationPointer } from "@hashintel/brunch-agent/ui";
import type { RetryContext } from "@local/hash-isomorphic-utils/create-apollo-client";
import type { AgentConversation } from "@local/hash-isomorphic-utils/system-types/agentconversation";

const agentIdBaseUrl = systemPropertyTypes.agentId.propertyTypeBaseUrl;
const focusLinkTypeId =
  systemLinkEntityTypes.hasAgentConversationFocus.linkEntityTypeId;

/** How long each retry of a failed read waits, through Apollo's retry link. */
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
 *   on it are kept here, by subject and in order, and written at once when
 *   the editor's save says it is saved, so the open one is still the newest.
 *   A draft left unsaved keeps them: if it is saved later in this page, they
 *   are written then, against it alone.
 * - A write that fails is tried again by the conversation's next message,
 *   with the same entity: a conversation whose entity was created but not its
 *   link goes on to the link, rather than being left unreachable.
 * - A read that fails is tried again by Apollo's retry link, after each of
 *   {@link readRetryDelaysMs}. If none succeeds, the failure is reported and
 *   the subject has no open conversation, so its next message starts one
 *   rather than leaving the agent unusable; `start` does not persist that
 *   fallback conversation, so it cannot supersede a newer one in the graph.
 *
 * Each write records the agent, web and subject as they were when it was
 * asked for, and writes run one at a time.
 *
 * Returns the conversation's pointer, a stable object while the open
 * conversation, as read, is unchanged, and `subjectSaved`, for the editor's
 * save to call once a subject exists.
 */
export const useAgentConversation = ({
  agentId,
  subjectEntityId,
  enabled,
  isSaved,
  captureException,
}: {
  /** Names the agent and the service that keeps its conversations. */
  agentId: string;
  /**
   * The entity the conversation focuses on, such as the open process, or
   * `null` with none open. A draft's is the one its first save creates.
   */
  subjectEntityId: EntityId | null;
  /** The conversation is offered: without it nothing is read. */
  enabled: boolean;
  /**
   * Whether a subject exists in the graph now, rather than being an unsaved
   * draft. Read when a conversation starts, so it may change without a render.
   */
  isSaved: (subjectEntityId: EntityId) => boolean;
  captureException: (error: unknown, context: { source: string }) => void;
}): {
  conversationPointer: BrunchConversationPointer;
  /**
   * The editor's first save of a draft made `subjectEntityId` exist (with
   * `createdHere: true`), or found it already existing elsewhere
   * (`createdHere: false`): its pending conversations are written at once, in
   * order.
   */
  subjectSaved: (
    subjectEntityId: EntityId,
    options?: { createdHere?: boolean },
  ) => void;
} => {
  const { authenticatedUser } = useAuthInfo();
  const userId = authenticatedUser?.accountId ?? null;

  // Keyed by their ids, as the user object may be new on every render.
  const creatableWebsKey = authenticatedUser
    ? [...creatableWebIds(authenticatedUser)].join(",")
    : "";
  const creatableWebs = useMemo(
    () => new Set(creatableWebsKey.split(",")),
    [creatableWebsKey],
  );

  const { data, error } = useQuery<
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
                {
                  parameter:
                    subjectEntityId &&
                    extractWebIdFromEntityId(subjectEntityId),
                },
              ],
            },
            {
              equal: [
                { path: ["outgoingLinks", "rightEntity", "uuid"] },
                {
                  parameter:
                    subjectEntityId &&
                    extractEntityUuidFromEntityId(subjectEntityId),
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
    skip: !enabled || userId === null || subjectEntityId === null,
    fetchPolicy: "network-only",
    context: { retryDelaysMs: readRetryDelaysMs } satisfies RetryContext,
    // Called once the retries are spent.
    onError: (readError) =>
      captureException(readError, { source: "agent-conversation.read" }),
  });

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

  // Newest first, so two entities on one subject (two tabs) read as the newest.
  // A read that failed after its retries has none open.
  const readFailed = readConversationIds === undefined && Boolean(error);
  const openConversationId =
    readConversationIds === undefined
      ? error
        ? null
        : undefined
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
      // The link gets a new id on each attempt, so if one lands but its
      // answer is lost, the next creates a second, identical link. That is
      // harmless: the read returns conversations, not links, so the
      // conversation still opens once. A fixed id would instead have a retry
      // refused for a taken id, which can't be told from a real failure, and
      // could mark a conversation done that was never linked.
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
    (source: string, conversationId: string, subject: EntityId) => {
      if (known.current.has(conversationId)) {
        return;
      }
      known.current.add(conversationId);
      const subjectWebId = extractWebIdFromEntityId(subject);
      const write = unfinished.current.get(conversationId) ?? {
        conversationId,
        agentId,
        subjectEntityId: subject,
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
    [agentId, userId, creatableWebs, writeConversation, captureException],
  );

  /**
   * The conversations started on each unsaved draft, by its id, in the order
   * they were, to write when it is saved.
   */
  const unsaved = useRef(
    new Map<EntityId, { source: string; conversationId: string }[]>(),
  );

  /**
   * Subjects whose first save happened in this session, so they are known to
   * have no pre-existing conversation in the graph even if the initial read
   * while still a draft failed.
   */
  const savedHere = useRef(new Set<EntityId>());

  const flushUnsaved = useCallback(
    (subject: EntityId) => {
      const intents = unsaved.current.get(subject) ?? [];
      unsaved.current.delete(subject);
      for (const { source, conversationId } of intents) {
        enqueue(source, conversationId, subject);
      }
    },
    [enqueue],
  );

  const subjectSaved = useCallback(
    (subject: EntityId, { createdHere = true } = {}) => {
      if (createdHere) {
        savedHere.current.add(subject);
      }
      flushUnsaved(subject);
    },
    [flushUnsaved],
  );

  const record = useCallback(
    (source: string, conversationId: string) => {
      if (subjectEntityId === null) {
        return;
      }
      if (isSaved(subjectEntityId)) {
        // Any it had while a draft, as when it was saved elsewhere, go first.
        flushUnsaved(subjectEntityId);
        enqueue(source, conversationId, subjectEntityId);
        return;
      }
      const intents = unsaved.current.get(subjectEntityId) ?? [];
      if (!intents.some((intent) => intent.conversationId === conversationId)) {
        intents.push({ source, conversationId });
      }
      unsaved.current.set(subjectEntityId, intents);
    },
    [subjectEntityId, isSaved, flushUnsaved, enqueue],
  );

  // Called for every message: only the first has anything to write. Skip
  // persisting a fallback conversation started after a failed read on an
  // already-saved subject so it cannot become the newest entity and shadow an
  // unreachable conversation in the graph. Retries for unfinished writes (e.g.
  // after an explicit `replace`), unsaved drafts, and drafts first saved in
  // this session still proceed.
  const start = useCallback(
    (conversationId: string) => {
      if (
        readFailed &&
        subjectEntityId !== null &&
        isSaved(subjectEntityId) &&
        !savedHere.current.has(subjectEntityId) &&
        !unfinished.current.has(conversationId)
      ) {
        return;
      }
      record("start", conversationId);
    },
    [readFailed, subjectEntityId, isSaved, record],
  );

  // Clearing starts the next conversation. The one before it is left as it
  // is: starting afresh doesn't say the earlier conversation may be discarded.
  // The newest conversation on a subject is the open one, so the new entity
  // is created now, before any message, for another browser to read.
  const replace = useCallback(
    (conversationId: string) => record("replace", conversationId),
    [record],
  );

  const conversationPointer = useMemo(
    () => ({ conversationId: openConversationId, start, replace }),
    [openConversationId, start, replace],
  );
  return { conversationPointer, subjectSaved };
};
