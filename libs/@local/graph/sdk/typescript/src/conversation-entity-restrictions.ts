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
  previousTypeIds: readonly VersionedUrl[],
  nextTypeIds: readonly VersionedUrl[],
): boolean => {
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

const collectClassificationBaseUrls = async (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  previousTypeIds: [VersionedUrl, ...VersionedUrl[]],
  nextTypeIds: [VersionedUrl, ...VersionedUrl[]],
): Promise<{ previous: Set<BaseUrl>; next: Set<BaseUrl> }> => {
  const { entityTypes } = await getClosedMultiEntityTypes(
    graphApi,
    authentication,
    {
      entityTypeIds: [previousTypeIds, nextTypeIds],
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  const baseUrlsFor = (typeIds: [VersionedUrl, ...VersionedUrl[]]) => {
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

  return {
    previous: baseUrlsFor(previousTypeIds),
    next: baseUrlsFor(nextTypeIds),
  };
};

/**
 * Refuses an entity update that adds or removes the `Agent Conversation` or
 * `Has Agent Conversation Focus` classification (directly or through
 * inheritance).
 *
 * Conversations and their focus links are private to their creator by default,
 * so reclassifying an entity would hide a shared entity from its web or expose
 * a private conversation to it. Lives at the TypeScript Graph SDK boundary
 * until the Graph's own hook/type-change permission model lands (BE-1204).
 */
export const ensureConversationClassificationPreserved = async ({
  graphApi,
  authentication,
  previousEntityTypeIds,
  nextEntityTypeIds,
}: {
  graphApi: GraphApi;
  authentication: AuthenticationContext;
  previousEntityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  nextEntityTypeIds: readonly string[] | undefined;
}): Promise<void> => {
  if (!nextEntityTypeIds || nextEntityTypeIds.length === 0) {
    return;
  }
  const typedNextEntityTypeIds = nextEntityTypeIds as [
    VersionedUrl,
    ...VersionedUrl[],
  ];
  if (hasUnchangedTypeSet(previousEntityTypeIds, typedNextEntityTypeIds)) {
    return;
  }

  const { previous, next } = await collectClassificationBaseUrls(
    graphApi,
    authentication,
    previousEntityTypeIds,
    typedNextEntityTypeIds,
  );

  for (const { baseUrl, title } of guardedClassifications) {
    if (previous.has(baseUrl) !== next.has(baseUrl)) {
      throw new ConversationClassificationError(title);
    }
  }
};
