// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";
import { theme } from "@hashintel/design-system/theme";

import { DependentTypesSection } from "./dependent-types-section";

import type { DependentTypeRow } from "./dependent-type-rows";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ComponentProps } from "react";

const typeId = (title: string, version: number) =>
  `https://example.com/@alice/types/entity-type/${title.toLowerCase().replaceAll(" ", "-")}/v/${version}` as VersionedUrl;

/**
 * A row for `title`, named by version `version`, with ranges given as
 * `[firstVersion, lastVersion, parentVersion]`.
 */
const makeRow = (
  title: string,
  version: number,
  ranges: [number, number, number][],
  former = false,
): DependentTypeRow => {
  const versions = new Map<number, number[]>();
  for (const [first, last, parent] of ranges) {
    for (let current = first; current <= last; current += 1) {
      versions.set(current, [...(versions.get(current) ?? []), parent]);
    }
  }

  return {
    entityType: {
      schema: {
        $schema: ENTITY_TYPE_META_SCHEMA,
        kind: "entityType",
        $id: typeId(title, version),
        title,
        description: `A ${title}`,
        type: "object",
        properties: {},
      },
    } as EntityTypeWithMetadata,
    former,
    firstVersion: Math.min(...ranges.map(([first]) => first)),
    lastVersion: Math.max(...ranges.map(([, last]) => last)),
    parentVersions: [...new Set(ranges.map(([, , parent]) => parent))].sort(),
    ranges: ranges.map(([firstVersion, lastVersion, parentVersion]) => ({
      firstVersion,
      lastVersion,
      lastVersionId: typeId(title, lastVersion),
      parentVersion,
    })),
    versions: [...versions]
      .map(([current, parentVersions]) => ({
        version: current,
        parentVersions,
      }))
      .sort((left, right) => left.version - right.version),
  };
};

const user = makeRow("User", 7, [
  [2, 3, 1],
  [4, 7, 2],
]);
const machine = makeRow("Machine", 2, [
  [1, 1, 1],
  [2, 2, 2],
]);
const shellCompany = makeRow("Shell Company", 2, [[1, 2, 1]], true);

const actor = {
  schema: {
    $schema: ENTITY_TYPE_META_SCHEMA,
    kind: "entityType",
    $id: typeId("Actor", 2),
    title: "Actor",
    description: "An actor",
    type: "object",
    properties: {},
  },
} as EntityTypeWithMetadata;

const renderSection = (
  props: Partial<ComponentProps<typeof DependentTypesSection>> = {},
) => {
  const onOpenType = vi.fn();

  render(
    <ThemeProvider theme={theme}>
      <DependentTypesSection
        entityType={actor}
        parentLatestVersion={2}
        rows={undefined}
        incomplete={false}
        error={undefined}
        isLinkType={() => false}
        onOpenType={onOpenType}
        {...props}
      />
    </ThemeProvider>,
  );

  return {
    onOpenType,
    section: screen.getByRole("region", { name: "Types that extend Actor" }),
  };
};

const userToggleName = "User v7, versions v2–v7, extends Actor v1, v2";

describe("DependentTypesSection", () => {
  afterEach(cleanup);

  it("says that it covers every version of the type", () => {
    const { section } = renderSection({ rows: [] });

    expect(section.textContent).toContain("Across all versions of Actor");
  });

  it("marks the section busy while loading", () => {
    const { section } = renderSection();

    expect(section.getAttribute("aria-busy")).toBe("true");
  });

  it("says so when no type extends the type, and offers no controls", () => {
    const { section } = renderSection({ rows: [] });

    expect(section.getAttribute("aria-busy")).toBe("false");
    expect(section.textContent).toContain("No types extend Actor yet.");
    expect(within(section).queryByRole("switch")).toBeNull();
  });

  it("shows an error message when loading fails", () => {
    const { section } = renderSection({ error: new Error("Network down") });

    expect(section.getAttribute("aria-busy")).toBe("false");
    within(section).getByText(
      "Couldn't load these types. Reload the page to try again.",
    );
  });

  it("shows one collapsed row per current type, with its version span and the versions of the type it extends", () => {
    const { section } = renderSection({
      rows: [machine, shellCompany, user],
    });

    expect(
      within(section)
        .getAllByRole("button", { expanded: false })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Machine v2, versions v1–v2, extends Actor v1, v2",
      userToggleName,
    ]);
  });

  it("expands a row into its version ranges, and collapses it again", () => {
    const { section } = renderSection({ rows: [user] });

    fireEvent.click(
      within(section).getByRole("button", { name: userToggleName }),
    );

    const ranges = within(section).getByRole("group", {
      name: "Version ranges of User",
    });
    expect(ranges.textContent).toContain("v2–v3");
    expect(ranges.textContent).toContain("v4–v7");
    within(ranges).getByRole("button", {
      name: "Open User v3, the highest version in v2–v3",
    });

    fireEvent.click(
      within(section).getByRole("button", {
        name: userToggleName,
        expanded: true,
      }),
    );

    expect(
      within(section).queryByRole("group", { name: "Version ranges of User" }),
    ).toBeNull();
  });

  it("opens a type's latest version from its row without expanding the row", () => {
    const { onOpenType, section } = renderSection({ rows: [user] });

    fireEvent.click(
      within(section).getByRole("button", { name: "Open User v7" }),
    );

    expect(onOpenType).toHaveBeenCalledWith(typeId("User", 7));
    within(section).getByRole("button", {
      name: userToggleName,
      expanded: false,
    });
  });

  it("opens a range at its highest version", () => {
    const { onOpenType, section } = renderSection({ rows: [user] });

    fireEvent.click(
      within(section).getByRole("button", { name: userToggleName }),
    );
    fireEvent.click(
      within(section).getByRole("button", {
        name: "Open User v3, the highest version in v2–v3",
      }),
    );

    expect(onOpenType).toHaveBeenCalledWith(typeId("User", 3));
  });

  it("lists former types, marked as former, once current children only is turned off", () => {
    const { onOpenType, section } = renderSection({
      rows: [shellCompany, user],
    });

    const currentOnly = within(section).getByRole("switch", {
      name: "Current children only",
    });
    expect((currentOnly as HTMLInputElement).checked).toBe(true);

    fireEvent.click(currentOnly);

    within(section).getByRole("button", {
      name: "Shell Company, former, versions v1–v2, extends Actor v1",
    });
    fireEvent.click(
      within(section).getByRole("button", {
        name: "Open Shell Company v2, its highest version that extends Actor",
      }),
    );
    expect(onOpenType).toHaveBeenCalledWith(typeId("Shell Company", 2));
  });

  it("says no type extends the type when only former types do, and keeps the switch", () => {
    const { section } = renderSection({ rows: [shellCompany] });

    expect(section.textContent).toContain("No types extend Actor yet.");
    within(section).getByRole("switch", { name: "Current children only" });
  });

  it("switches between the layouts", () => {
    const { section } = renderSection({ rows: [user] });

    const byChild = within(section).getByRole("button", {
      name: "By child type",
    });
    const byParent = within(section).getByRole("button", {
      name: "By parent version",
    });
    expect(byChild.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(byParent);

    expect(byParent.getAttribute("aria-pressed")).toBe("true");
    expect(
      within(section).queryByRole("button", { name: userToggleName }),
    ).toBeNull();
  });

  it("explains each control", () => {
    const { section } = renderSection({ rows: [user] });

    within(section).getByRole("button", { name: "About the layouts" });
    within(section).getByRole("button", { name: "About current children" });
  });

  it("warns that types or versions may be missing when a query reached its row limit", () => {
    const { section } = renderSection({ rows: [user], incomplete: true });

    within(section).getByText(
      "Some types or versions may be missing from this table.",
    );
  });

  it("does not warn when every query came back complete", () => {
    const { section } = renderSection({ rows: [user] });

    expect(
      within(section).queryByText(
        "Some types or versions may be missing from this table.",
      ),
    ).toBeNull();
  });
});
