import { ThemeProvider } from "@mui/material";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
) =>
  renderToStaticMarkup(
    <ThemeProvider theme={theme}>
      <DependentTypesSection
        heading="Types that extend Animal"
        emptyMessage="No types extend Animal yet."
        types={undefined}
        error={undefined}
        isLink={false}
        onTypeClick={() => {}}
        {...props}
      />
    </ThemeProvider>,
  );

describe("DependentTypesSection", () => {
  it("shows a skeleton while loading", () => {
    expect(renderSection()).toContain('aria-busy="true"');
  });

  it("says so when there are no types", () => {
    expect(renderSection({ types: [] })).toContain(
      "No types extend Animal yet.",
    );
  });

  it("shows an error message when loading fails", () => {
    expect(renderSection({ error: new Error("Network down") })).toContain(
      "Reload the page to try again.",
    );
  });

  it("lists each type under the heading", () => {
    const markup = renderSection({
      types: [makeEntityType("Cat"), makeEntityType("Dog")],
    });

    expect(markup).toMatch(/Types that extend Animal.*Cat.*Dog/s);
  });
});
