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
