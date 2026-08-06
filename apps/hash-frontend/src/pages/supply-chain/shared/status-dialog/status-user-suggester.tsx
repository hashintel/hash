import { createPortal } from "react-dom";

import { css, cx } from "@hashintel/ds-helpers/css";

import type { EntityId } from "@blockprotocol/type-system";

export interface StatusMentionUser {
  displayName: string;
  entityId: EntityId;
  shortname: string;
}

export const filterStatusMentionUsers = (
  users: readonly StatusMentionUser[],
  search: string,
): StatusMentionUser[] => {
  const normalizedSearch = search.trim().toLocaleLowerCase();

  return users
    .filter(
      (user) =>
        !normalizedSearch ||
        user.displayName.toLocaleLowerCase().includes(normalizedSearch) ||
        user.shortname.toLocaleLowerCase().includes(normalizedSearch),
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
};

export const nextStatusMentionIndex = (
  currentIndex: number,
  direction: 1 | -1,
  optionCount: number,
): number =>
  optionCount > 0
    ? (currentIndex + direction + optionCount) % optionCount
    : currentIndex;

const list = css({
  position: "fixed",
  maxH: "40",
  overflowY: "auto",
  m: "0",
  p: "0.5",
  listStyle: "none",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bgSolid.min",
  boxShadow: "lg",
});
const option = css({
  display: "flex",
  flexDirection: "column",
  w: "full",
  px: "2",
  py: "1",
  borderRadius: "sm",
  textAlign: "left",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
});
const selectedOption = css({ bg: "bg.subtle" });
const displayName = css({
  fontSize: "xs",
  lineHeight: "tight",
  color: "fg.heading",
  fontWeight: "medium",
});
const shortname = css({
  fontSize: "xs",
  lineHeight: "tight",
  color: "fg.subtle",
});
const empty = css({ px: "2", py: "1", fontSize: "xs", color: "fg.subtle" });

export const StatusUserSuggester = ({
  activeIndex,
  anchor,
  id,
  onSelect,
  portalContainer,
  search,
  users,
}: {
  activeIndex: number;
  anchor: { left: number; top: number } | null;
  id: string;
  onSelect: (user: StatusMentionUser) => void;
  portalContainer: Element;
  search: string;
  users: readonly StatusMentionUser[];
}) => {
  const matches = filterStatusMentionUsers(users, search);

  return createPortal(
    <ul
      aria-label="Mention a supply chain member"
      className={list}
      id={id}
      role="listbox"
      style={{
        left: anchor?.left ?? 4,
        top: anchor?.top ?? 4,
        width: "min(14rem, calc(100vw - 0.5rem))",
        zIndex: "var(--z-index-tooltip)",
      }}
    >
      {matches.length ? (
        matches.map((user, index) => (
          <li
            aria-selected={index === activeIndex}
            id={`${id}-option-${index}`}
            key={user.entityId}
            role="option"
          >
            <button
              className={cx(option, index === activeIndex && selectedOption)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(user);
              }}
              type="button"
            >
              <span className={displayName}>{user.displayName}</span>
              <span className={shortname}>@{user.shortname}</span>
            </button>
          </li>
        ))
      ) : (
        <li className={empty}>No matching members</li>
      )}
    </ul>,
    portalContainer,
  );
};
