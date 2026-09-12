import { describe, expect, it } from "vitest";

import {
  preferencesToRebaseFrom,
  rebaseUserPreferences,
} from "./rebase-preferences";

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
      rebaseUserPreferences({ base: preferences, next, latest: undefined }),
    ).toStrictEqual(next);
  });

  it("keeps fields the caller never saw", () => {
    // A section the caller does not know about must survive its update.
    const latest = {
      ...withEntitiesExpanded(preferences),
      unknownSection: { expanded: true },
    } as UserPreferences;

    const rebased = rebaseUserPreferences({
      base: preferences,
      next: withPagesCollapsed(preferences),
      latest,
    });

    expect(rebased.sidebarSections.pages.expanded).toBe(false);
    expect(rebased.sidebarSections.entities.expanded).toBe(true);
    expect(rebased).toHaveProperty("unknownSection", { expanded: true });
  });

  it("keeps another caller's first change when neither had stored preferences", () => {
    // Neither caller had any preferences stored, so both built their payload
    // from the defaults `useUserPreferences` substitutes – which is what they
    // are rebased from, so the defaults they never chose are not mistaken for
    // changes of their own.
    const base = preferencesToRebaseFrom({
      rendered: preferences,
      inFlightPayload: undefined,
    });

    const rebased = rebaseUserPreferences({
      base,
      next: withPagesCollapsed(preferences),
      // the other caller's first-ever save, which landed first
      latest: withEntitiesExpanded(preferences),
    });

    expect(rebased.sidebarSections.pages.expanded).toBe(false);
    expect(rebased.sidebarSections.entities.expanded).toBe(true);
  });
});

describe("preferencesToRebaseFrom", () => {
  it("takes what the caller rendered when it has nothing in flight", () => {
    expect(
      preferencesToRebaseFrom({
        rendered: preferences,
        inFlightPayload: undefined,
      }),
    ).toStrictEqual(preferences);
  });

  it("keeps a second change to the same field made before the first landed", () => {
    // The caller expanded a section, then collapsed it again before its own
    // update landed, so the preferences it renders still show it collapsed and
    // its second payload matches them exactly.
    const firstPayload = withEntitiesExpanded(preferences);

    const onServer = rebaseUserPreferences({
      base: preferencesToRebaseFrom({
        rendered: preferences,
        inFlightPayload: undefined,
      }),
      next: firstPayload,
      latest: preferences,
    });

    expect(onServer.sidebarSections.entities.expanded).toBe(true);

    const rebased = rebaseUserPreferences({
      base: preferencesToRebaseFrom({
        rendered: preferences,
        inFlightPayload: firstPayload,
      }),
      next: { ...preferences },
      latest: onServer,
    });

    expect(rebased.sidebarSections.entities.expanded).toBe(false);
  });
});
