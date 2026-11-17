import { useMutation, useQuery } from "@apollo/client";
import { use, useCallback, useEffect, useMemo, useRef } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { ErrorTrackerContext } from "@hashintel/petrinaut";
import {
  deserializeQueryEntitySubgraphResponse,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createEntityMutation,
  queryEntitySubgraphQuery,
} from "../../../../../../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../../../../../shared/auth-info-context";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { AgentConversation } from "@local/hash-isomorphic-utils/system-types/agentconversation";

const conversationIdBaseUrl =
  systemPropertyTypes.conversationId.propertyTypeBaseUrl;
const agentIdBaseUrl = systemPropertyTypes.agentId.propertyTypeBaseUrl;
const contextEntityIdBaseUrl =
  systemPropertyTypes.contextEntityId.propertyTypeBaseUrl;

/**
 * The signed-in user's conversations with one agent that were started on one
 * entity, its context, and which of them is open. Each is an
 * `Agent Conversation` entity in the context's web, created by the user, whose
 * `Context Entity ID` names the context. The agent keeps the messages; the
 * entity is the conversation's handle in the graph, so the open conversation
 * follows the user to another browser.
 *
 * - The open conversation is the newest of the user's unarchived ones on the
 *   context. Other members' conversations are left out by the read itself,
 *   since a web admin may see them.
 * - A conversation gets its entity when its first message is sent, unless
 *   this page already knows one for it.
 * - Clearing creates the next conversation's entity, before any message, so
 *   another browser opens it. The earlier one stays as it is.
 * - A draft has its final entity id, and so its web, from the start, so its
 *   conversations are recorded exactly as a saved process's are.
 *
 * Each write records the agent, web and context as they were when it was
 * asked for, and writes run one at a time.
 *
 * Returns a stable object while the open conversation, as read, is unchanged.
 */
export const useAgentConversation = ({
  agentId,
  contextEntityId,
}: {
  /** Names the agent and the service that keeps its conversations. */
  agentId: string;
  /** The entity the conversation is started on, such as the open process. */
  contextEntityId: EntityId;
}): {
  /** `undefined` while it is read, `null` when the context has none open. */
  conversationId: string | null | undefined;
  /** A message was sent in this conversation. */
  start: (conversationId: string) => void;
  /** The user cleared the chat: this conversation is now the open one. */
  replace: (conversationId: string) => void;
} => {
  const { authenticatedUser } = useAuthInfo();
  const userId = authenticatedUser?.accountId ?? null;
  const webId = extractWebIdFromEntityId(contextEntityId);
  const { captureException } = use(ErrorTrackerContext);

  const { data, error } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
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
            {
              equal: [
                { path: ["properties", contextEntityIdBaseUrl] },
                { parameter: contextEntityId },
              ],
            },
            { equal: [{ path: ["createdById"] }, { parameter: userId }] },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
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

  useEffect(() => {
    if (error) {
      captureException(error, { source: "agent-conversation.read" });
    }
  }, [error, captureException]);

  /** The conversation ids read, newest first. */
  const readConversationIds = useMemo(() => {
    if (!data) {
      return undefined;
    }
    const { subgraph } = deserializeQueryEntitySubgraphResponse(
      data.queryEntitySubgraph,
    );
    return getRoots(subgraph)
      .toSorted((left, right) =>
        right.metadata.provenance.createdAtDecisionTime.localeCompare(
          left.metadata.provenance.createdAtDecisionTime,
        ),
      )
      .flatMap((conversation) => {
        const conversationId = conversation.properties[conversationIdBaseUrl];
        return typeof conversationId === "string" ? [conversationId] : [];
      });
  }, [data]);

  // Newest first, so two entities on one context (two tabs) read as the newest.
  const openConversationId =
    readConversationIds === undefined
      ? undefined
      : (readConversationIds[0] ?? null);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  /** The conversations this page read, or created or is creating, entities for. */
  const known = useRef(new Set<string>());
  useEffect(() => {
    for (const conversationId of readConversationIds ?? []) {
      known.current.add(conversationId);
    }
  }, [readConversationIds]);

  /** Writes run one at a time, so two can't each create the same entity. */
  const writes = useRef<Promise<void>>(Promise.resolve());

  // Everything the write records is taken now, when it is asked for: the hook
  // stays mounted as the user moves between processes, and a write queued on
  // one must not be recorded against the next.
  const record = useCallback(
    (source: string, conversationId: string) => {
      if (known.current.has(conversationId)) {
        return;
      }
      known.current.add(conversationId);
      const variables: CreateEntityMutationVariables = {
        entityTypeIds: [systemEntityTypes.agentConversation.entityTypeId],
        webId,
        properties: mergePropertyObjectAndMetadata<AgentConversation>(
          {
            "https://hash.ai/@h/types/property-type/conversation-id/":
              conversationId,
            "https://hash.ai/@h/types/property-type/agent-id/": agentId,
            "https://hash.ai/@h/types/property-type/context-entity-id/":
              contextEntityId,
          },
          undefined,
        ),
      };
      writes.current = writes.current
        .then(async () => {
          const created = await createEntity({ variables });
          if (!created.data) {
            throw new Error("Creating the conversation returned no entity");
          }
        })
        .catch((writeError: unknown) => {
          // Not recorded, so its next message tries again.
          known.current.delete(conversationId);
          captureException(writeError, {
            source: `agent-conversation.${source}`,
          });
        });
    },
    [agentId, webId, contextEntityId, createEntity, captureException],
  );

  // Called for every message: only the first has anything to write.
  const start = useCallback(
    (conversationId: string) => record("start", conversationId),
    [record],
  );

  // Clearing starts the next conversation. The one before it is left as it
  // is: starting afresh doesn't say the earlier conversation may be discarded.
  // The newest conversation on a context is the open one, so the new entity
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
