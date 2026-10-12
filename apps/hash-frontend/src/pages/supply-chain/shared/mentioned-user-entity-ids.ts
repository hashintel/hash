import type { EntityId } from "@blockprotocol/type-system";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

export const mentionedUserEntityIds = (
  tokens: readonly TextToken[],
): EntityId[] => [
  ...new Set(
    tokens.flatMap((token) =>
      token.tokenType === "mention" && token.mentionType === "user"
        ? [token.entityId]
        : [],
    ),
  ),
];
