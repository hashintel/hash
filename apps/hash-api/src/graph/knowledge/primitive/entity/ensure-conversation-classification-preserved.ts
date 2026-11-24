import { extractBaseUrl } from "@blockprotocol/type-system";
import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";
import { getClosedMultiEntityTypes } from "@local/hash-graph-sdk/entity-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import * as Error from "../../../../graphql/error";

import type { ImpureGraphContext } from "../../../context-types";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

const guardedClassifications: ReadonlyArray<{
  baseUrl: BaseUrl;
  title: string;
}> = [
  {
    baseUrl: systemEntityTypes.agentConversation.entityTypeBaseUrl,
    title: "Agent Conversation",
  },
  {
    baseUrl:
      systemLinkEntityTypes.hasAgentConversationFocus.linkEntityTypeBaseUrl,
    title: "Has Agent Conversation Focus",
  },
];

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
  context: ImpureGraphContext<false, true>,
  authentication: AuthenticationContext,
  previousTypeIds: [VersionedUrl, ...VersionedUrl[]],
  nextTypeIds: [VersionedUrl, ...VersionedUrl[]],
): Promise<{ previous: Set<BaseUrl>; next: Set<BaseUrl> }> => {
  const { entityTypes } = await getClosedMultiEntityTypes(
    context.graphApi,
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
 * a private conversation to it. Lives in the Node API update path until the
 * Graph's own hook/type-change permission model lands (BE-1204).
 */
export const ensureConversationClassificationPreserved = async ({
  context,
  authentication,
  previousEntityTypeIds,
  nextEntityTypeIds,
}: {
  context: ImpureGraphContext<false, true>;
  authentication: AuthenticationContext;
  previousEntityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  nextEntityTypeIds: [VersionedUrl, ...VersionedUrl[]] | undefined;
}): Promise<void> => {
  if (
    !nextEntityTypeIds ||
    hasUnchangedTypeSet(previousEntityTypeIds, nextEntityTypeIds)
  ) {
    return;
  }

  const { previous, next } = await collectClassificationBaseUrls(
    context,
    authentication,
    previousEntityTypeIds,
    nextEntityTypeIds,
  );

  for (const { baseUrl, title } of guardedClassifications) {
    if (previous.has(baseUrl) !== next.has(baseUrl)) {
      throw Error.forbidden(
        `Entity updates must preserve the ${title} classification.`,
      );
    }
  }
};
