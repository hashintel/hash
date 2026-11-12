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

import { makeRow, typeId } from "./dependent-type-fixtures";
import { getParentVersionRows } from "./dependent-type-rows";
import { DependentTypesByVersionTable } from "./dependent-types-by-version-table";

import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";

/*
 * Company is at v4, which no type extends yet, so v4 gets no row.
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

const renderTable = () => {
  const onOpenType = vi.fn();

  render(
    <ThemeProvider theme={theme}>
      <h2 id="heading">Types that extend Company</h2>
      <DependentTypesByVersionTable
        labelledBy="heading"
        entityType={company}
        parentVersionRows={getParentVersionRows({
          rows: [charity, publicCompany, soleTrader],
        })}
        isLinkType={() => false}
        onOpenType={onOpenType}
      />
    </ThemeProvider>,
  );

  return { onOpenType };
};

const toggle = (name: string) => screen.getByRole("button", { name });

/** Each row below the header, as its cells' text under the header of their column. */
const describeRows = () => {
  const headers = screen
    .getAllByRole("columnheader", { hidden: true })
    .map((header) => header.textContent);

  return screen
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

  it("is a table named by its heading, with a header for each column", () => {
    renderTable();

    expect(
      within(screen.getByRole("table", { name: "Types that extend Company" }))
        .getAllByRole("columnheader", { hidden: true })
        .map((header) => header.textContent),
    ).toEqual(["Company version", "Extended by", "Versions"]);
  });

  it("shows one collapsed row per version of the type that a type extends, newest first, with how many types extend it, and which", () => {
    renderTable();

    expect(describeRows()).toEqual([
      {
        "Company version": "Companyv3",
        "Extended by": "2 typesCharity, Public Company",
        Versions: "",
      },
      {
        "Company version": "Companyv2",
        "Extended by": "3 typesCharity, Public Company, Sole Trader",
        Versions: "",
      },
      {
        "Company version": "Companyv1",
        "Extended by": "1 typeCharity",
        Versions: "",
      },
    ]);
    expect(
      screen
        .getAllByRole("button", { expanded: false })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Company v3", "Company v2", "Company v1"]);
  });

  it("expands a version into the types that extend it, with their versions that do, and collapses it again", () => {
    renderTable();

    fireEvent.click(toggle("Company v2"));

    screen.getByRole("button", { name: "Company v2", expanded: true });
    expect(describeRows().slice(1, 5)).toEqual([
      {
        "Company version": "Companyv2",
        "Extended by": "3 typesCharity, Public Company, Sole Trader",
        Versions: "",
      },
      {
        "Company version": "",
        "Extended by": "Charityv6",
        Versions: "v3–v4, v6",
      },
      {
        "Company version": "",
        "Extended by": "Public Companyv3",
        Versions: "v1",
      },
      {
        "Company version": "",
        "Extended by": "Sole TraderFormer",
        Versions: "v1–v3",
      },
    ]);

    fireEvent.click(toggle("Company v2"));

    screen.getByRole("button", { name: "Company v2", expanded: false });
    expect(describeRows()).toHaveLength(3);
  });

  it("opens a type at its highest version that extends the expanded version", () => {
    const { onOpenType } = renderTable();

    fireEvent.click(toggle("Company v2"));
    fireEvent.click(
      toggle("Open Charity v6, the highest version that extends Company v2"),
    );
    expect(onOpenType).toHaveBeenLastCalledWith(typeId("Charity", 6));

    fireEvent.click(toggle("Company v3"));
    fireEvent.click(
      toggle("Open Charity v5, the highest version that extends Company v3"),
    );
    expect(onOpenType).toHaveBeenLastCalledWith(typeId("Charity", 5));

    screen.getByRole("button", { name: "Company v3", expanded: true });
  });

  it("opens a former type at its highest version that extends the expanded version", () => {
    const { onOpenType } = renderTable();

    fireEvent.click(toggle("Company v2"));
    fireEvent.click(
      toggle(
        "Open Sole Trader v3, the highest version that extends Company v2",
      ),
    );

    expect(onOpenType).toHaveBeenCalledWith(typeId("Sole Trader", 3));
  });

  it("shows a type's description when its title is hovered", async () => {
    renderTable();

    fireEvent.click(toggle("Company v1"));
    const row = toggle(
      "Open Charity v2, the highest version that extends Company v1",
    ).closest<HTMLElement>('[role="row"]');
    fireEvent.mouseOver(within(row ?? document.body).getByText("Charity"));

    expect((await screen.findByRole("tooltip")).textContent).toBe("A Charity");
  });

  it("shows a type's description when its open button gets keyboard focus, and describes the button with it", async () => {
    renderTable();

    fireEvent.click(toggle("Company v1"));
    const name = "Open Charity v2, the highest version that extends Company v1";
    focusWithKeyboard(toggle(name));

    expect((await screen.findByRole("tooltip")).textContent).toBe("A Charity");
    screen.getByRole("button", { name, description: "A Charity" });
  });

  it("opens a version of the type from its row without expanding the row", () => {
    const { onOpenType } = renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Open Company v2" }));

    expect(onOpenType).toHaveBeenCalledWith(typeId("Company", 2));
    screen.getByRole("button", { name: "Company v2", expanded: false });
  });
});
