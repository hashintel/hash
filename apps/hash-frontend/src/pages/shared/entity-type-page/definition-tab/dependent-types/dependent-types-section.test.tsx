// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";
import { theme } from "@hashintel/design-system/theme";

import { makeRow, typeId } from "./dependent-type-fixtures";
import { DependentTypesSection } from "./dependent-types-section";

import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";
import type { ComponentProps } from "react";

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
        knownParentLatestVersion={2}
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

/** Each row below the header, as its cells' text under the header of their column. */
const describeRows = (section: HTMLElement) => {
  const headers = within(section)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);

  return within(section)
    .getAllByRole("row")
    .slice(1)
    .map((row) => {
      const cells = within(row).getAllByRole("cell");
      return Object.fromEntries(
        headers.map((header, index) => [
          header,
          cells[index]?.textContent.trim(),
        ]),
      );
    });
};

describe("DependentTypesSection", () => {
  afterEach(cleanup);
  beforeAll(() => {
    // The layout `SegmentedControl` measures its segments, which jsdom can't.
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect() {}

      observe() {}

      unobserve() {}
    };
  });

  it("marks the section busy while loading", () => {
    const { section } = renderSection();

    expect(section.getAttribute("aria-busy")).toBe("true");
  });

  it("says so when no type extends the type, and offers no controls", () => {
    const { section } = renderSection({ rows: [] });

    expect(section.getAttribute("aria-busy")).toBe("false");
    within(section).getByText("No types extend Actor");
    expect(within(section).queryByRole("switch")).toBeNull();
  });

  it("shows an error message when loading fails", () => {
    const { section } = renderSection({ error: new Error("Network down") });

    expect(section.getAttribute("aria-busy")).toBe("false");
    within(section).getByText(
      "Couldn't load these types. Reload the page to try again.",
    );
  });

  it("shows the types in a table named by the heading, with the toggle in each row's first cell and the open button in its last", () => {
    const { section } = renderSection({ rows: [machine, user] });

    const table = within(section).getByRole("table", {
      name: "Types that extend Actor",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Type", "Versions", "Extends Actor"]);
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole("cell")
            .map(
              (cell) =>
                within(cell)
                  .queryByRole("button")
                  ?.getAttribute("aria-label") ?? null,
            ),
        ),
    ).toEqual([
      ["Machine v2", null, null, "Open Machine v2"],
      ["User v7", null, null, "Open User v7"],
    ]);
  });

  it("shows one collapsed row per current type, with its version span and the versions of the type it extends", () => {
    const { section } = renderSection({
      rows: [machine, shellCompany, user],
    });

    expect(describeRows(section)).toEqual([
      { Type: "Machinev2", Versions: "v1–v2", "Extends Actor": "v1, v2" },
      { Type: "Userv7", Versions: "v2–v7", "Extends Actor": "v1, v2" },
    ]);
    expect(
      within(section)
        .getAllByRole("button", { expanded: false })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Machine v2", "User v7"]);
  });

  it("expands a row into its version ranges, and collapses it again", () => {
    const { section } = renderSection({ rows: [user] });

    fireEvent.click(within(section).getByRole("button", { name: "User v7" }));

    within(section).getByRole("button", { name: "User v7", expanded: true });
    expect(describeRows(section)).toEqual([
      { Type: "Userv7", Versions: "v2–v7", "Extends Actor": "v1, v2" },
      { Type: "", Versions: "v2–v3", "Extends Actor": "v1" },
      { Type: "", Versions: "v4–v7", "Extends Actor": "v2" },
    ]);
    within(section).getByRole("button", {
      name: "Open User v3, the highest version in v2–v3, which extends Actor v1",
    });

    fireEvent.click(within(section).getByRole("button", { name: "User v7" }));

    within(section).getByRole("button", { name: "User v7", expanded: false });
    expect(describeRows(section)).toHaveLength(1);
  });

  it("opens a type's latest version from its row without expanding the row", () => {
    const { onOpenType, section } = renderSection({ rows: [user] });

    fireEvent.click(
      within(section).getByRole("button", { name: "Open User v7" }),
    );

    expect(onOpenType).toHaveBeenCalledWith(typeId("User", 7));
    within(section).getByRole("button", { name: "User v7", expanded: false });
  });

  it("opens a range at its highest version", () => {
    const { onOpenType, section } = renderSection({ rows: [user] });

    fireEvent.click(within(section).getByRole("button", { name: "User v7" }));
    fireEvent.click(
      within(section).getByRole("button", {
        name: "Open User v3, the highest version in v2–v3, which extends Actor v1",
      }),
    );

    expect(onOpenType).toHaveBeenCalledWith(typeId("User", 3));
  });

  it("lists former types, marked as former, once former types are included", () => {
    const { onOpenType, section } = renderSection({
      rows: [shellCompany, user],
    });

    const includeFormer = within(section).getByRole("switch", {
      name: "Include former types",
    });
    expect((includeFormer as HTMLInputElement).checked).toBe(false);

    fireEvent.click(includeFormer);

    within(section).getByRole("button", { name: "Shell Company, former" });
    expect(describeRows(section)[0]).toEqual({
      Type: "Shell CompanyFormer",
      Versions: "v1–v2",
      "Extends Actor": "v1",
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

    within(section).getByText("No types extend Actor");
    within(section).getByRole("switch", { name: "Include former types" });
  });

  it("switches between the layouts", async () => {
    const { section } = renderSection({ rows: [user] });

    const byChild = within(section).getByRole<HTMLInputElement>("radio", {
      name: "By type",
    });
    const byParent = within(section).getByRole<HTMLInputElement>("radio", {
      name: "By version",
    });
    expect(byChild.checked).toBe(true);

    fireEvent.click(byParent);

    // The segmented control reports the change after the click.
    await waitFor(() =>
      expect(
        within(section).queryByRole("button", { name: "User v7" }),
      ).toBeNull(),
    );
    within(section).getByRole("button", { name: "Actor v2" });
    expect(byParent.checked).toBe(true);
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
