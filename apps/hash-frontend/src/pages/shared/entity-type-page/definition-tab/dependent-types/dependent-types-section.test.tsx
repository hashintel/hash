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
  `https://example.com/@alice/types/entity-type/${title.toLowerCase()}/v/${version}` as VersionedUrl;

/**
 * A row for `title`, whose latest version is `latestVersion`, with ranges
 * given as `[firstVersion, lastVersion, parentVersion]`.
 */
const makeRow = (
  title: string,
  latestVersion: number,
  ranges: [number, number, number][],
): DependentTypeRow => ({
  entityType: {
    schema: {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: typeId(title, latestVersion),
      title,
      description: `A ${title}`,
      type: "object",
      properties: {},
    },
  } as EntityTypeWithMetadata,
  firstVersion: Math.min(...ranges.map(([first]) => first)),
  lastVersion: Math.max(...ranges.map(([, last]) => last)),
  parentVersions: [...new Set(ranges.map(([, , parent]) => parent))].sort(),
  ranges: ranges.map(([firstVersion, lastVersion, parentVersion]) => ({
    firstVersion,
    lastVersion,
    lastVersionId: typeId(title, lastVersion),
    parentVersion,
  })),
});

const user = makeRow("User", 7, [
  [2, 3, 1],
  [4, 7, 2],
]);
const machine = makeRow("Machine", 2, [
  [1, 1, 1],
  [2, 2, 2],
]);

const renderSection = (
  props: Partial<ComponentProps<typeof DependentTypesSection>> = {},
) => {
  const onOpenType = vi.fn();

  render(
    <ThemeProvider theme={theme}>
      <DependentTypesSection
        entityTypeTitle="Actor"
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

const rowToggle = (section: HTMLElement, name: string) =>
  within(section).getByRole("button", { name, expanded: false });

/** The text of each cell in the table row that contains `text`. */
const cellsOfRowWith = (section: HTMLElement, text: string) =>
  within(within(section).getByText(text).closest("tr")!)
    .getAllByRole("cell")
    .map((cell) => cell.textContent.trim());

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

  it("says so when there are no types", () => {
    const { section } = renderSection({ rows: [] });

    expect(section.getAttribute("aria-busy")).toBe("false");
    expect(section.textContent).toContain("No types extend Actor yet.");
    expect(within(section).queryByRole("table")).toBeNull();
  });

  it("shows an error message when loading fails", () => {
    const { section } = renderSection({ error: new Error("Network down") });

    expect(section.getAttribute("aria-busy")).toBe("false");
    within(section).getByText(
      "Couldn't load these types. Reload the page to try again.",
    );
  });

  it("shows one collapsed row per type, with its version span and the versions of the type it extends", () => {
    const { section } = renderSection({ rows: [machine, user] });

    expect(
      within(section)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Type", "Versions", "Extends Actor", ""]);

    rowToggle(section, "User v7");
    expect(cellsOfRowWith(section, "v2–v7")).toEqual([
      "User v7",
      "v2–v7",
      "v1, v2",
      "",
    ]);

    expect(within(section).queryByText("v2–v3")).toBeNull();
  });

  it("expands a row into its version ranges when the row is clicked, and collapses it again", () => {
    const { section } = renderSection({ rows: [user] });

    fireEvent.click(within(section).getByText("v2–v7"));

    const toggle = within(section).getByRole("button", {
      name: "User v7",
      expanded: true,
    });
    expect(cellsOfRowWith(section, "v2–v3")).toEqual(["", "v2–v3", "v1", ""]);
    expect(cellsOfRowWith(section, "v4–v7")).toEqual(["", "v4–v7", "v2", ""]);

    fireEvent.click(toggle);

    rowToggle(section, "User v7");
  });

  it("opens a type's latest version from its row without expanding the row", () => {
    const { onOpenType, section } = renderSection({ rows: [user] });

    fireEvent.click(
      within(section).getByRole("button", { name: "Open User v7" }),
    );

    expect(onOpenType).toHaveBeenCalledWith(typeId("User", 7));
    rowToggle(section, "User v7");
  });

  it("opens a range at its highest version", () => {
    const { onOpenType, section } = renderSection({ rows: [user] });

    fireEvent.click(rowToggle(section, "User v7"));
    fireEvent.click(
      within(section).getByRole("button", { name: "Open User v3" }),
    );

    expect(onOpenType).toHaveBeenCalledWith(typeId("User", 3));
  });

  it("warns that types or versions may be missing when a query reached its row limit", () => {
    const { section } = renderSection({ rows: [user], incomplete: true });

    within(section).getByText(
      "Some types or versions may be missing from this table.",
    );
    within(section).getByRole("table");
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
