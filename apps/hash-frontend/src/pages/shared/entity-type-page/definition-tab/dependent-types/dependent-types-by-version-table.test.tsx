// @vitest-environment jsdom
import { ThemeProvider } from "@mui/material";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";
import { theme } from "@hashintel/design-system/theme";

import { getParentVersionRows } from "./dependent-type-rows";
import { DependentTypesByVersionTable } from "./dependent-types-by-version-table";

import type { DependentTypeRow } from "./dependent-type-rows";
import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

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

/*
 * Company is at v4, which no type extends yet.
 * Charity v1–v2 extend Company v1, v3–v4 v2, v5 v3, and v6 goes back to v2.
 * Public Company v1 extends Company v2, and v2–v3 extend v3.
 * Sole Trader v1–v3 extend Company v2, and its latest version no longer does.
 */
const charity = makeRow("Charity", 6, [
  [1, 2, 1],
  [3, 4, 2],
  [5, 5, 3],
  [6, 6, 2],
]);
const publicCompany = makeRow("Public Company", 3, [
  [1, 1, 2],
  [2, 3, 3],
]);
const soleTrader = makeRow("Sole Trader", 3, [[1, 3, 2]], true);

const company = {
  schema: {
    $schema: ENTITY_TYPE_META_SCHEMA,
    kind: "entityType",
    $id: typeId("Company", 4),
    title: "Company",
    description: "A company",
    type: "object",
    properties: {},
  },
} as EntityTypeWithMetadata;

const v4Name = "Company v4, extended by no types";
const v3Name = "Company v3, extended by 2 types: Charity, Public Company";
const v2Name =
  "Company v2, extended by 3 types: Charity, Public Company, Sole Trader";
const v1Name = "Company v1, extended by 1 type: Charity";

const renderTable = () => {
  const onOpenType = vi.fn();

  const { container } = render(
    <ThemeProvider theme={theme}>
      <DependentTypesByVersionTable
        entityType={company}
        parentVersionRows={getParentVersionRows({
          rows: [charity, publicCompany, soleTrader],
          parentLatestVersion: 4,
        })}
        isLinkType={() => false}
        onOpenType={onOpenType}
      />
    </ThemeProvider>,
  );

  return { container, onOpenType };
};

const expand = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));

  return screen.getByRole("group", {
    name: `Types that extend ${name.split(",")[0]}`,
  });
};

// jsdom never matches `:focus-visible`, which MUI checks to tell keyboard focus from a mouse press.
const focusWithKeyboard = (element: HTMLElement) => {
  const matches = element.matches.bind(element);
  const focusVisible = vi
    .spyOn(element, "matches")
    .mockImplementation(
      (selector) => selector === ":focus-visible" || matches(selector),
    );

  act(() => {
    element.focus();
  });

  focusVisible.mockRestore();
};

describe("DependentTypesByVersionTable", () => {
  afterEach(cleanup);

  it("shows one collapsed row per version of the type, newest first, naming the types that extend it", () => {
    renderTable();

    expect(
      screen
        .getAllByRole("button", { name: /, extended by / })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([v4Name, v3Name, v2Name, v1Name]);
    for (const name of [v3Name, v2Name, v1Name]) {
      screen.getByRole("button", { name, expanded: false });
    }
  });

  it("shows how many types extend each version", () => {
    renderTable();

    for (const [name, count] of [
      [v4Name, "No types"],
      [v3Name, "2 types"],
      [v2Name, "3 types"],
      [v1Name, "1 type"],
    ] as const) {
      within(screen.getByRole("button", { name })).getByText(count);
    }
  });

  it("disables a version that no type extends, and shows no chevron for it", () => {
    renderTable();

    const v4 = screen.getByRole("button", { name: v4Name });
    const v3 = screen.getByRole("button", { name: v3Name });
    expect((v4 as HTMLButtonElement).disabled).toBe(true);
    expect(v4.getAttribute("aria-expanded")).toBeNull();
    expect((v3 as HTMLButtonElement).disabled).toBe(false);
    // The chevron is the row's only hidden decoration beside its toggle.
    const chevronOf = (toggle: HTMLElement) =>
      [...(toggle.parentElement?.children ?? [])].find(
        (sibling) => sibling.getAttribute("aria-hidden") === "true",
      );
    expect(chevronOf(v4)).toBeUndefined();
    expect(chevronOf(v3)).toBeDefined();

    fireEvent.click(v4);

    expect(
      screen.queryByRole("group", { name: "Types that extend Company v4" }),
    ).toBeNull();
  });

  it("expands a version into the types that extend it, with their versions that do, and collapses it again", () => {
    renderTable();

    const group = expand(v2Name);

    expect(
      [...group.children].map((subRow) => subRow.textContent.trim()),
    ).toEqual([
      "Charityv6v3–v4, v6 A Charity",
      "Public Companyv3v1 A Public Company",
      "Sole TraderFormerv1–v3 A Sole Trader",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: v2Name, expanded: true }),
    );

    expect(
      screen.queryByRole("group", { name: "Types that extend Company v2" }),
    ).toBeNull();
  });

  it("opens a type at its highest version that extends the expanded version", () => {
    const { onOpenType } = renderTable();

    fireEvent.click(
      within(expand(v2Name)).getByRole("button", {
        name: "Open Charity v6, the highest version that extends Company v2",
      }),
    );
    expect(onOpenType).toHaveBeenLastCalledWith(typeId("Charity", 6));

    fireEvent.click(
      within(expand(v3Name)).getByRole("button", {
        name: "Open Charity v5, the highest version that extends Company v3",
      }),
    );
    expect(onOpenType).toHaveBeenLastCalledWith(typeId("Charity", 5));

    screen.getByRole("button", { name: v3Name, expanded: true });
  });

  it("marks a former type as former, and opens its highest version that extends the expanded version", () => {
    const { onOpenType } = renderTable();

    const group = expand(v2Name);
    const open = within(group).getByRole("button", {
      name: "Open Sole Trader v3, the highest version that extends Company v2",
    });
    expect(open.parentElement?.textContent.trim()).toBe(
      "Sole TraderFormerv1–v3 A Sole Trader",
    );

    fireEvent.click(open);

    expect(onOpenType).toHaveBeenCalledWith(typeId("Sole Trader", 3));
  });

  it("shows a type's description when its title is hovered", async () => {
    renderTable();

    fireEvent.mouseOver(within(expand(v1Name)).getByText("Charity"));

    expect((await screen.findByRole("tooltip")).textContent).toBe("A Charity");
  });

  it("describes a type's open button with the type's description, and shows it when the button gets keyboard focus", async () => {
    renderTable();

    const open = within(expand(v1Name)).getByRole("button", {
      name: "Open Charity v2, the highest version that extends Company v1",
      description: "A Charity",
    });
    focusWithKeyboard(open);

    expect((await screen.findByRole("tooltip")).textContent).toBe("A Charity");
  });

  it("says that a type can appear under several versions in this layout", () => {
    const { container } = renderTable();

    expect(container.textContent).toContain(
      "In this layout a type can appear under several Company versions. In the “By child type” layout each type appears once.",
    );
  });

  it("opens a version of the type from its row without expanding the row", () => {
    const { onOpenType } = renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Open Company v2" }));

    expect(onOpenType).toHaveBeenCalledWith(typeId("Company", 2));
    screen.getByRole("button", { name: v2Name, expanded: false });
  });
});
