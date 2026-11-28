import { extractBaseUrl } from "@blockprotocol/type-system";

import { getClosedMultiEntityTypes } from "./entity-type.js";
import { getClosedMultiEntityTypeFromMap } from "./entity.js";

import type { AuthenticationContext } from "./authentication-context.js";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

const guardedClassifications: ReadonlyArray<{
  baseUrl: BaseUrl;
  title: string;
}> = [
  {
    baseUrl:
      "https://hash.ai/@h/types/entity-type/agent-conversation/" as BaseUrl,
    title: "Agent Conversation",
  },
  {
    baseUrl:
      "https://hash.ai/@h/types/entity-type/has-agent-conversation-focus/" as BaseUrl,
    title: "Has Agent Conversation Focus",
  },
];

const currentTimeInstantTemporalAxes = {
  pinned: {
    axis: "transactionTime" as const,
    timestamp: null,
  },
  variable: {
    axis: "decisionTime" as const,
    interval: {
      start: null,
      end: null,
    },
  },
};

export type NonEmptyEntityTypeIds = [VersionedUrl, ...VersionedUrl[]];

export type EntityTypeTransition = {
  previousEntityTypeIds: NonEmptyEntityTypeIds;
  nextEntityTypeIds: NonEmptyEntityTypeIds;
};

/**
 * Thrown when an entity patch attempts to add or remove a creator-private
 * conversation classification (`Agent Conversation` or `Has Agent Conversation Focus`).
 */
export class ConversationClassificationError extends Error {
  constructor(title: string) {
    super(`Entity updates must preserve the ${title} classification.`);
    this.name = "ConversationClassificationError";
  }
}

const hasUnchangedTypeSet = (
  previousTypeIds: NonEmptyEntityTypeIds,
  nextTypeIds: NonEmptyEntityTypeIds,
): boolean => {
  if (previousTypeIds.length === 1 && nextTypeIds.length === 1) {
    return previousTypeIds[0] === nextTypeIds[0];
  }
  const previous = new Set(previousTypeIds);
  const next = new Set(nextTypeIds);
  if (previous.size !== next.size) {
    return false;
  }
  for (const typeId of previous) {
    if (!next.has(typeId)) {
      return false;
    }
  }
  return true;
};

/**
 * Refuses any entity type transition in `transitions` that adds or removes the
 * `Agent Conversation` or `Has Agent Conversation Focus` classification
 * (directly or through inheritance), issuing at most one batched
 * `getClosedMultiEntityTypes` call for all transitions whose type set changed.
 *
 * Conversations and their focus links are private to their creator by default,
 * so reclassifying an entity would hide a shared entity from its web or expose
 * a private conversation to it. Lives at the TypeScript Graph SDK boundary
 * until the Graph's own hook/type-change permission model lands (BE-1204).
 */
export const ensureConversationClassificationsPreserved = async ({
  graphApi,
  authentication,
  transitions,
}: {
  graphApi: GraphApi;
  authentication: AuthenticationContext;
  transitions: readonly EntityTypeTransition[];
}): Promise<void> => {
  const changed = transitions.filter(
    ({ previousEntityTypeIds, nextEntityTypeIds }) =>
      !hasUnchangedTypeSet(previousEntityTypeIds, nextEntityTypeIds),
  );
  if (changed.length === 0) {
    return;
  }

  const uniqueTypeSets = new Map<string, NonEmptyEntityTypeIds>();
  for (const { previousEntityTypeIds, nextEntityTypeIds } of changed) {
    for (const typeIds of [previousEntityTypeIds, nextEntityTypeIds]) {
      const key = [...typeIds].toSorted().join("\0");
      if (!uniqueTypeSets.has(key)) {
        uniqueTypeSets.set(key, typeIds);
      }
    }
  }

  const { entityTypes } = await getClosedMultiEntityTypes(
    graphApi,
    authentication,
    {
      entityTypeIds: [...uniqueTypeSets.values()],
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  const baseUrlsFor = (typeIds: NonEmptyEntityTypeIds) => {
    const closed = getClosedMultiEntityTypeFromMap(entityTypes, typeIds);
    const urls = new Set<BaseUrl>();
    for (const entry of closed.allOf) {
      urls.add(extractBaseUrl(entry.$id));
      for (const parent of entry.allOf) {
        urls.add(extractBaseUrl(parent.$id));
      }
    }
    return urls;
  };

  for (const { previousEntityTypeIds, nextEntityTypeIds } of changed) {
    const previous = baseUrlsFor(previousEntityTypeIds);
    const next = baseUrlsFor(nextEntityTypeIds);
    for (const { baseUrl, title } of guardedClassifications) {
      if (previous.has(baseUrl) !== next.has(baseUrl)) {
        throw new ConversationClassificationError(title);
      }
    }
  }
};

/** Single-entity convenience wrapper over {@link ensureConversationClassificationsPreserved}. */
export const ensureConversationClassificationPreserved = async ({
  graphApi,
  authentication,
  previousEntityTypeIds,
  nextEntityTypeIds,
}: {
  graphApi: GraphApi;
  authentication: AuthenticationContext;
  previousEntityTypeIds: NonEmptyEntityTypeIds;
  nextEntityTypeIds: NonEmptyEntityTypeIds;
}): Promise<void> =>
  ensureConversationClassificationsPreserved({
    graphApi,
    authentication,
    transitions: [{ previousEntityTypeIds, nextEntityTypeIds }],
  });
