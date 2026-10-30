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

import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ComponentProps } from "react";

vi.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/" }),
}));

const makeEntityType = (title: string): EntityTypeWithMetadata =>
  ({
    schema: {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: `https://example.com/@alice/types/entity-type/${title.toLowerCase()}/v/1` as VersionedUrl,
      title,
      description: `A ${title}`,
      type: "object",
      properties: {},
    },
  }) as EntityTypeWithMetadata;

const renderSection = (
  props: Partial<ComponentProps<typeof DependentTypesSection>> = {},
) => {
  const onTypeClick = vi.fn();

  render(
    <ThemeProvider theme={theme}>
      <DependentTypesSection
        heading="Types that extend Animal"
        emptyMessage="No types extend Animal yet."
        types={undefined}
        error={undefined}
        isLinkType={() => false}
        onTypeClick={onTypeClick}
        {...props}
      />
    </ThemeProvider>,
  );

  return {
    onTypeClick,
    section: screen.getByRole("region", { name: "Types that extend Animal" }),
  };
};

describe("DependentTypesSection", () => {
  afterEach(cleanup);

  it("marks the section busy while loading", () => {
    const { section } = renderSection();

    expect(section.getAttribute("aria-busy")).toBe("true");
  });

  it("says so when there are no types", () => {
    const { section } = renderSection({ types: [] });

    expect(section.getAttribute("aria-busy")).toBe("false");
    within(section).getByText("No types extend Animal yet.");
  });

  it("shows an error message when loading fails", () => {
    const { section } = renderSection({ error: new Error("Network down") });

    expect(section.getAttribute("aria-busy")).toBe("false");
    within(section).getByText(
      "Couldn't load these types. Reload the page to try again.",
    );
  });

  it("lists each type with its version", () => {
    const { section } = renderSection({
      types: [makeEntityType("Cat"), makeEntityType("Dog")],
    });

    expect(
      within(section)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Cat v1", "Dog v1"]);
  });

  it("opens a type when its card is clicked", () => {
    const cat = makeEntityType("Cat");
    const { onTypeClick, section } = renderSection({ types: [cat] });

    fireEvent.click(within(section).getByRole("link", { name: "Cat v1" }));

    expect(onTypeClick).toHaveBeenCalledWith(cat.schema.$id);
  });
});
