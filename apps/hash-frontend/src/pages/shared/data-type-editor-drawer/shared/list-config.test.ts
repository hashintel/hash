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
});
