import { useMemo } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useUsers } from "../../../components/hooks/use-users";

import type { EntityId } from "@blockprotocol/type-system";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

const mentionStyle = css({
  color: "fg.link",
  fontWeight: "medium",
  textDecoration: "none",
  _hover: { textDecoration: "underline" },
});

export const StatusBody = ({ tokens }: { tokens: readonly TextToken[] }) => {
  const mentionedEntityIds = useMemo(
    () =>
      new Set(
        tokens.flatMap((token) =>
          token.tokenType === "mention" && token.mentionType === "user"
            ? [token.entityId]
            : [],
        ),
      ),
    [tokens],
  );
  const { users } = useUsers();
  const mentionedUsersByEntityId = useMemo(
    () =>
      new Map(
        (users ?? [])
          .filter((user) =>
            mentionedEntityIds.has(user.entity.metadata.recordId.entityId),
          )
          .map((user) => [user.entity.metadata.recordId.entityId, user]),
      ),
    [mentionedEntityIds, users],
  );

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
      : (user?.displayName ?? "@Unknown user");

    return user?.shortname ? (
      <a
        className={mentionStyle}
        href={`/@${user.shortname}`}
        key={`${tokenKey}-${token.entityId}`}
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
