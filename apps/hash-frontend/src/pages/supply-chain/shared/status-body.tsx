import { css } from "@hashintel/ds-helpers/css";

import type { EntityId } from "@blockprotocol/type-system";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

const mentionStyle = css({
  color: "fg.link",
  fontWeight: "medium",
  textDecoration: "none",
  _hover: { textDecoration: "underline" },
});

export const StatusBody = ({
  mentionedUsersByEntityId,
  tokens,
}: {
  mentionedUsersByEntityId: ReadonlyMap<
    EntityId,
    { displayName?: string; shortname?: string }
  >;
  tokens: readonly TextToken[];
}) => {
  let tokenPosition = 0;
  return tokens.map((token) => {
    const tokenKey = `${tokenPosition}-${token.tokenType}`;
    tokenPosition += token.tokenType === "text" ? token.text.length : 1;

    if (token.tokenType === "hardBreak") {
      return <br key={tokenKey} />;
    }
    if (token.tokenType === "text") {
      return <span key={tokenKey}>{token.text}</span>;
    }

    const user = mentionedUsersByEntityId.get(token.entityId);
    const label = user?.shortname
      ? `@${user.shortname}`
      : (user?.displayName ?? `@${token.entityId}`);

    return user?.shortname ? (
      <a
        className={mentionStyle}
        href={`/@${user.shortname}`}
        key={`${tokenKey}-${token.entityId}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {label}
      </a>
    ) : (
      <span key={`${tokenKey}-${token.entityId}`}>{label}</span>
    );
  });
};

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
