// @vitest-environment jsdom
import { useQuery } from "@apollo/client";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTypeConversions } from "./data-type-conversions";

vi.mock("@apollo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@apollo/client")>()),
  useQuery: vi.fn(() => ({ data: undefined, loading: false })),
}));
vi.mock("react-hook-form", () => ({
  useFormContext: () => ({ control: {} }),
  useWatch: ({ name }: { name: string }) =>
    name === "constraints.type"
      ? "number"
      : {
          "https://hash.ai/@h/types/data-type/coulombs/": {
            from: {
              expression: ["/", "self", { const: 3600000, type: "number" }],
            },
            to: {
              expression: ["*", "self", { const: 3600000, type: "number" }],
            },
          },
        },
}));
vi.mock("../data-types-context", () => ({
  useDataTypesContext: () => ({ dataTypes: null, loading: true }),
}));
vi.mock("../slide-stack", () => ({
  useSlideStack: () => ({ pushToSlideStack: vi.fn() }),
}));
vi.mock("./shared/use-inherited-constraints", () => ({
  useInheritedConstraints: () => ({ conversions: {} }),
}));
vi.mock("../../../shared/ui/link", () => ({ Link: () => null }));
vi.mock("./data-type-conversions/conversion-editor", () => ({
  ConversionEditor: () => null,
}));
vi.mock("./data-type-conversions/conversion-target-editor", () => ({
  ConversionTargetEditor: () => null,
}));

describe("DataTypeConversions", () => {
  afterEach(cleanup);

  it("waits for the catalogue before resolving conversion targets", () => {
    const { container } = render(
      <DataTypeConversions
        dataType={{
          $schema:
            "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          kind: "dataType",
          $id: "https://hash.ai/@h/types/data-type/kiloampere-hours/v/1",
          title: "Kiloampere Hours",
          description: "A unit of electric charge.",
          type: "number",
        }}
        isReadOnly
      />,
    );

    expect(container.innerHTML).toBe("");
    expect(useQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true }),
    );
  });
});
