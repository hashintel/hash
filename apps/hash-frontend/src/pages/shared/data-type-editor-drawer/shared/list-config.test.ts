import { describe, expect, it } from "vitest";

import {
  arraySchemaFromListConfig,
  defaultListElement,
  listConfigFromArraySchema,
} from "./list-config";

import type { ListConfig } from "./list-config";

const flexibleConfig = (overrides: Partial<ListConfig>): ListConfig => ({
  shape: "flexible",
  itemType: null,
  minItems: null,
  maxItems: null,
  elements: [defaultListElement()],
  ...overrides,
});

describe("arraySchemaFromListConfig", () => {
  it("emits item and length constraints for a bounded flexible list", () => {
    expect(
      arraySchemaFromListConfig(
        flexibleConfig({ itemType: "number", minItems: 1, maxItems: 5 }),
      ),
    ).toEqual({
      type: "array",
      items: { type: "number" },
      minItems: 1,
      maxItems: 5,
    });
  });

  it("keeps a zero minimum but omits unset bounds", () => {
    expect(arraySchemaFromListConfig(flexibleConfig({ minItems: 0 }))).toEqual({
      type: "array",
      minItems: 0,
    });
  });
});

describe("listConfigFromArraySchema", () => {
  it("round-trips flexible length bounds", () => {
    const config = flexibleConfig({
      itemType: "string",
      minItems: 2,
      maxItems: 10,
    });
    expect(
      listConfigFromArraySchema(arraySchemaFromListConfig(config)),
    ).toEqual(config);
  });

  it("reads unconstrained schemas as null bounds", () => {
    expect(listConfigFromArraySchema({ minItems: 3 })).toEqual(
      flexibleConfig({ minItems: 3 }),
    );
    expect(listConfigFromArraySchema({})).toEqual(flexibleConfig({}));
  });

  it("keeps item-level constraints through a load-save round trip", () => {
    const schema = {
      type: "array" as const,
      items: { type: "string" as const, minLength: 2, pattern: "^[A-Z]" },
      minItems: 1,
    };

    expect(
      arraySchemaFromListConfig(listConfigFromArraySchema(schema)),
    ).toEqual(schema);
  });

  it("rebuilds a bare item schema when the item type changes", () => {
    const config = listConfigFromArraySchema({
      items: { type: "string", minLength: 2 },
    });

    expect(
      arraySchemaFromListConfig({ ...config, itemType: "number" }),
    ).toEqual({ type: "array", items: { type: "number" } });
  });

  it("keeps fixed element constraints but replaces edited labels", () => {
    const config = listConfigFromArraySchema({
      items: false,
      prefixItems: [
        { type: "number", minimum: 0, label: { left: "£" } },
        { type: "string" },
      ],
    });

    const relabelled = {
      ...config,
      elements: config.elements.map((element, index) =>
        index === 0 ? { ...element, before: "", after: "GBP" } : element,
      ),
    };

    expect(arraySchemaFromListConfig(relabelled)).toEqual({
      type: "array",
      items: false,
      prefixItems: [
        { type: "number", minimum: 0, label: { right: "GBP" } },
        { type: "string" },
      ],
    });
  });
});
