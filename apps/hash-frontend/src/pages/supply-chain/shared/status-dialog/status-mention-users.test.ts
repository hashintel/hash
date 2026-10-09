import { describe, expect, it } from "vitest";

import {
  filterStatusMentionUsers,
  nextStatusMentionIndex,
  type StatusMentionUser,
} from "./status-mention-users";

import type { EntityId } from "@blockprotocol/type-system";

const members: StatusMentionUser[] = [
  {
    displayName: "Alex Rivera",
    entityId: "web~alex" as EntityId,
    shortname: "arivera",
  },
  {
    displayName: "Morgan Chen",
    entityId: "web~morgan" as EntityId,
    shortname: "mchen",
  },
];

describe("status user suggester", () => {
  it("searches active members by display name and shortname", () => {
    expect(filterStatusMentionUsers(members, "river")).toEqual([members[0]]);
    expect(filterStatusMentionUsers(members, "MCH")).toEqual([members[1]]);
    expect(filterStatusMentionUsers(members, "outside")).toEqual([]);
  });

  it("wraps keyboard selection through matching members", () => {
    expect(nextStatusMentionIndex(0, 1, 2)).toBe(1);
    expect(nextStatusMentionIndex(1, 1, 2)).toBe(0);
    expect(nextStatusMentionIndex(0, -1, 2)).toBe(1);
  });
});
