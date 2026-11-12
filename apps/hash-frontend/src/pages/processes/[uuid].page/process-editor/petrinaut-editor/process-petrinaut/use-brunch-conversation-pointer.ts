import { useMutation, useQuery } from "@apollo/client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { ErrorTrackerContext } from "@hashintel/petrinaut";
import {
  deserializeQueryEntitySubgraphResponse,
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createEntityMutation,
  queryEntitySubgraphQuery,
  updateEntityMutation,
} from "../../../../../../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../../../../../shared/auth-info-context";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../../../graphql/api-types.gen";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { BrunchConversationPointer } from "@hashintel/brunch-agent/ui";

const conversationIdBaseUrl =
  systemPropertyTypes.conversationId.propertyTypeBaseUrl;

/**
 * Which Brunch conversation the signed-in user has with one process, kept in
 * HASH as an `Agent Conversation` entity in the user's own web, linked to the
 * process. Brunch keeps the messages; the entity holds only the conversation's
 * id, so the conversation follows the user to another browser and a cleared
 * one stays cleared.
 *
 * Nothing is stored until the user first clears: until then the process's
 * first conversation applies. A draft has no entity to link to, so a draft's
 * cleared conversation is stored once its first save has created the process.
 * Returns a stable object while the stored conversation is unchanged.
 */
export const useBrunchConversationPointer = ({
  processEntityId,
  processExists,
}: {
  processEntityId: EntityId;
  /** The process is saved. A draft's entity doesn't exist yet. */
  processExists: boolean;
}): BrunchConversationPointer => {
  const { authenticatedUser } = useAuthInfo();
  const userWebId = (authenticatedUser?.accountId ?? null) as WebId | null;
  const { captureException } = use(ErrorTrackerContext);

  // A process this page opened as a draft had nothing stored for it, and
  // still has nothing once its first save creates it. Reading then would
  // unbind the conversation the user is in for the length of the request.
  const [openedAsDraft, setOpenedAsDraft] = useState<EntityId | null>(
    processExists ? null : processEntityId,
  );
  if (!processExists && openedAsDraft !== processEntityId) {
    setOpenedAsDraft(processEntityId);
  }
  const nothingStored = openedAsDraft === processEntityId;

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
                { path: ["outgoingLinks", "rightEntity", "uuid"] },
                { parameter: extractEntityUuidFromEntityId(processEntityId) },
              ],
            },
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
    skip: userWebId === null || nothingStored,
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (error) {
      captureException(error, { source: "brunch.conversation-pointer.read" });
    }
  }, [error, captureException]);

  const stored = useMemo(() => {
    if (!data) {
      return undefined;
    }
    const { subgraph } = deserializeQueryEntitySubgraphResponse(
      data.queryEntitySubgraph,
    );
    // Two tabs clearing at once can each create an entity; the newest wins.
    const [latest] = getRoots(subgraph).toSorted((a, b) =>
      b.metadata.provenance.createdAtDecisionTime.localeCompare(
        a.metadata.provenance.createdAtDecisionTime,
      ),
    );
    if (!latest) {
      return null;
    }
    const conversationId = latest.properties[conversationIdBaseUrl];
    return typeof conversationId === "string"
      ? { entityId: latest.metadata.recordId.entityId, conversationId }
      : null;
  }, [data]);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);
  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  /**
   * The entity this page wrote to or read, per process: later clears update
   * it, without waiting on a refetch.
   */
  const writtenEntityIds = useRef(new Map<EntityId, EntityId>());
  const storedEntityId = stored?.entityId;
  useEffect(() => {
    if (
      storedEntityId !== undefined &&
      !writtenEntityIds.current.has(processEntityId)
    ) {
      writtenEntityIds.current.set(processEntityId, storedEntityId);
    }
  }, [processEntityId, storedEntityId]);

  const store = useCallback(
    async (conversationId: string) => {
      if (userWebId === null) {
        return;
      }
      const existingEntityId = writtenEntityIds.current.get(processEntityId);
      if (existingEntityId !== undefined) {
        await updateEntity({
          variables: {
            entityUpdate: {
              entityId: existingEntityId,
              propertyPatches: [
                {
                  op: "add",
                  path: [conversationIdBaseUrl],
                  property: {
                    value: conversationId,
                    metadata: {
                      dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                    },
                  },
                },
              ],
            },
          },
        });
        return;
      }
      const created = await createEntity({
        variables: {
          entityTypeIds: [systemEntityTypes.agentConversation.entityTypeId],
          webId: userWebId,
          properties: mergePropertyObjectAndMetadata(
            { [conversationIdBaseUrl]: conversationId },
            undefined,
          ),
        },
      });
      if (!created.data) {
        throw new Error("Creating the conversation entity returned no entity");
      }
      const conversationEntityId = new HashEntity(created.data.createEntity)
        .metadata.recordId.entityId;
      await createEntity({
        variables: {
          entityTypeIds: [systemLinkEntityTypes.hasSubject.linkEntityTypeId],
          webId: userWebId,
          properties: mergePropertyObjectAndMetadata({}, undefined),
          linkData: {
            leftEntityId: conversationEntityId,
            rightEntityId: processEntityId,
          },
        },
      });
      writtenEntityIds.current.set(processEntityId, conversationEntityId);
    },
    [createEntity, updateEntity, processEntityId, userWebId],
  );

  /** Writes run one at a time, so two clears can't each create an entity. */
  const writes = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback(
    (conversationId: string) => {
      writes.current = writes.current
        .then(() => store(conversationId))
        .catch((storeError: unknown) =>
          captureException(storeError, {
            source: "brunch.conversation-pointer.write",
          }),
        );
    },
    [store, captureException],
  );

  /**
   * A draft's cleared conversation, held until its first save creates the
   * process the entity links to.
   */
  const heldForDraft = useRef<{
    processEntityId: EntityId;
    conversationId: string;
  } | null>(null);
  useEffect(() => {
    const held = heldForDraft.current;
    if (processExists && held?.processEntityId === processEntityId) {
      heldForDraft.current = null;
      enqueue(held.conversationId);
    }
  }, [processExists, processEntityId, enqueue]);

  const replace = useCallback(
    (conversationId: string) => {
      if (processExists) {
        enqueue(conversationId);
      } else {
        heldForDraft.current = { processEntityId, conversationId };
      }
    },
    [processExists, enqueue, processEntityId],
  );

  // `undefined` while the read is in flight or has failed.
  const conversationId = nothingStored
    ? null
    : stored === undefined
      ? undefined
      : (stored?.conversationId ?? null);

  return useMemo(
    () => ({ conversationId, replace }),
    [conversationId, replace],
  );
};
