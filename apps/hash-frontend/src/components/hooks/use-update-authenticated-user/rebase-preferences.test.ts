import { describe, expect, it } from "vitest";

import { rebaseUserPreferences } from "./rebase-preferences";

import type {
  Favorite,
  UserPreferences,
} from "../../../shared/use-user-preferences";
import type { EntityId } from "@blockprotocol/type-system";

const preferences: UserPreferences = {
  favorites: [],
  sidebarSections: {
    entityTypes: { variant: "link", expanded: false },
    entities: { variant: "link", expanded: false },
    favorites: { expanded: true },
    pages: { expanded: true },
  },
};

const withEntitiesExpanded = (base: UserPreferences): UserPreferences => ({
  ...base,
  sidebarSections: {
    ...base.sidebarSections,
    entities: { ...base.sidebarSections.entities, expanded: true },
  },
});

const withPagesCollapsed = (base: UserPreferences): UserPreferences => ({
  ...base,
  sidebarSections: {
    ...base.sidebarSections,
    pages: { ...base.sidebarSections.pages, expanded: false },
  },
});

const favorite = (entityId: string): Favorite => ({
  type: "entity",
  entityId: entityId as EntityId,
});

describe("rebaseUserPreferences", () => {
  it("keeps a change which landed while the caller's update was queued", () => {
    // The caller collapsed the pages section using the preferences it had
    // rendered, unaware that a sibling component expanded the entities section
    // in the meantime.
    const rebased = rebaseUserPreferences({
      base: preferences,
      next: withPagesCollapsed(preferences),
      latest: withEntitiesExpanded(preferences),
    });

    expect(rebased.sidebarSections.pages.expanded).toBe(false);
    expect(rebased.sidebarSections.entities.expanded).toBe(true);
  });

  it("keeps the caller's change when the server changed the same field", () => {
    const rebased = rebaseUserPreferences({
      base: preferences,
      next: withPagesCollapsed(preferences),
      latest: withPagesCollapsed(withEntitiesExpanded(preferences)),
    });

    expect(rebased.sidebarSections.pages.expanded).toBe(false);
    expect(rebased.sidebarSections.entities.expanded).toBe(true);
  });

  it("takes the server's value for anything the caller did not change", () => {
    const rebased = rebaseUserPreferences({
      base: preferences,
      next: { ...preferences },
      latest: withEntitiesExpanded(preferences),
    });

    expect(rebased).toStrictEqual(withEntitiesExpanded(preferences));
  });

  it("adds a favorite without dropping one added in the meantime", () => {
    const rebased = rebaseUserPreferences({
      base: preferences,
      next: { ...preferences, favorites: [favorite("mine")] },
      latest: { ...preferences, favorites: [favorite("theirs")] },
    });

    expect(rebased.favorites).toStrictEqual([
      favorite("theirs"),
      favorite("mine"),
    ]);
  });

  it("removes a favorite without dropping one added in the meantime", () => {
    const base = { ...preferences, favorites: [favorite("old")] };

    const rebased = rebaseUserPreferences({
      base,
      next: { ...base, favorites: [] },
      latest: { ...base, favorites: [favorite("old"), favorite("new")] },
    });

    expect(rebased.favorites).toStrictEqual([favorite("new")]);
  });

  it("sends the caller's preferences as-is when the server has none", () => {
    const next = withEntitiesExpanded(preferences);

    expect(
      rebaseUserPreferences({ base: undefined, next, latest: undefined }),
    ).toStrictEqual(next);
  });

  it("keeps fields the caller never saw when it had no preferences", () => {
    // The caller rendered before the user had any preferences, so everything it
    // sends is a change – but a section the caller does not know about must
    // survive.
    const latest = {
      ...withEntitiesExpanded(preferences),
      unknownSection: { expanded: true },
    } as UserPreferences;

    const rebased = rebaseUserPreferences({
      base: undefined,
      next: withPagesCollapsed(preferences),
      latest,
    });

    expect(rebased.sidebarSections.pages.expanded).toBe(false);
    expect(rebased.sidebarSections.entities.expanded).toBe(false);
    expect(rebased).toHaveProperty("unknownSection", { expanded: true });
  });
});
