import { describe, expect, it } from "vitest";

import { getDataTypeLabelPreview as getPreviewParts } from "./data-type-label-preview";

import type {
  DataType,
  DataTypeWithMetadata,
  SingleValueSchema,
  VersionedUrl,
} from "@blockprotocol/type-system";

const id = (name: string): VersionedUrl =>
  `https://example.com/types/data-type/${name}/v/1`;
const scalar = (name: string, extras: Partial<DataType> = {}): DataType =>
  ({
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    kind: "dataType",
    $id: id(name),
    title: name,
    description: name,
    type: "number",
    ...extras,
  }) as DataType;
const lookup = (...schemas: DataType[]) =>
  Object.fromEntries(
    schemas.map((schema) => [schema.$id, { schema } as DataTypeWithMetadata]),
  );

const getDataTypeLabelPreview = (...args: Parameters<typeof getPreviewParts>) =>
  getPreviewParts(...args)
    ?.map(({ text }) => text)
    .join("");

const repeated = <Item>(
  length: number,
  item: (index: number) => Item,
): [Item, ...Item[]] => [
  item(0),
  ...Array.from({ length: length - 1 }, (_, index) => item(index + 1)),
];

describe("data type label previews", () => {
  it("shows labels in their left and right positions", () => {
    expect(
      getDataTypeLabelPreview(scalar("meters", { label: { right: "m" } }), {}),
    ).toBe("value m");
    expect(
      getDataTypeLabelPreview(scalar("dollars", { label: { left: "$" } }), {}),
    ).toBe("$value");
    expect(
      getDataTypeLabelPreview(
        scalar("rate", { label: { left: "$", right: "/h" } }),
        {},
      ),
    ).toBe("$value /h");
  });

  it("leaves unlabeled types and abstract groups without a preview", () => {
    expect(
      getDataTypeLabelPreview(scalar("number", { abstract: true }), {}),
    ).toBeUndefined();
    expect(
      getDataTypeLabelPreview(scalar("text", { type: "string" }), {}),
    ).toBeUndefined();
  });

  it("inherits the nearest complete label and lets a child replace it", () => {
    const distant = scalar("distant", { label: { left: "$", right: "/h" } });
    const parent = scalar("parent", {
      label: { right: "m" },
      allOf: [{ $ref: distant.$id }],
    });
    const child = scalar("child", { allOf: [{ $ref: parent.$id }] });
    const types = lookup(distant, parent, child);
    expect(getDataTypeLabelPreview(child, types)).toBe("value m");
    expect(
      getDataTypeLabelPreview({ ...child, label: { left: "€" } }, types),
    ).toBe("€value");
    expect(
      getDataTypeLabelPreview({ ...child, label: { right: "" } }, types),
    ).toBeUndefined();
  });

  it("resolves the referenced parent version, including parents outside the visible rows", () => {
    const parent = scalar("parent", { label: { right: "m" } });
    const later = {
      ...parent,
      $id: parent.$id.replace("/v/1", "/v/2") as VersionedUrl,
      label: { right: "km" },
    };
    expect(
      getDataTypeLabelPreview(
        scalar("child", { allOf: [{ $ref: parent.$id }] }),
        lookup(parent, later),
      ),
    ).toBe("value m");
  });

  it("omits ambiguous inherited labels instead of selecting an arbitrary parent", () => {
    const meters = scalar("meters", { label: { right: "m" } });
    const feet = scalar("feet", { label: { right: "ft" } });
    const child = scalar("child", {
      allOf: [{ $ref: meters.$id }, { $ref: feet.$id }],
    });
    expect(
      getDataTypeLabelPreview(child, lookup(meters, feet)),
    ).toBeUndefined();
    expect(
      getDataTypeLabelPreview(
        child,
        lookup(meters, { ...feet, label: { right: "m" } }),
      ),
    ).toBe("value m");
  });

  it("handles missing parents and cycles without breaking the listing", () => {
    const child = scalar("child", {
      type: "array",
      maxItems: 1,
      allOf: [{ $ref: id("parent") }],
    });
    const parent = scalar("parent", {
      type: "array",
      items: { type: "number", label: { right: "m" } },
      allOf: [{ $ref: child.$id }],
    });
    expect(getDataTypeLabelPreview(child, {})).toBeUndefined();
    expect(getDataTypeLabelPreview(child, lookup(parent, child))).toBe(
      "[value m]",
    );
  });

  it("keeps local item and alternative labels when the outer label cannot be resolved", () => {
    const meters = scalar("meters", { type: "array", label: { right: "m" } });
    const feet = scalar("feet", { type: "array", label: { right: "ft" } });
    const list = scalar("list", {
      type: "array",
      items: { type: "number", label: { right: "s" } },
      allOf: [{ $ref: meters.$id }, { $ref: feet.$id }],
    });
    expect(getDataTypeLabelPreview(list, lookup(meters, feet))).toBe(
      "[value s, value s, …]",
    );
    expect(getDataTypeLabelPreview(list, {})).toBe("[value s, value s, …]");
    expect(
      getDataTypeLabelPreview(
        {
          ...list,
          type: "array",
          items: false,
          prefixItems: [{ type: "number", label: { right: "s" } }],
        },
        lookup(meters, feet),
      ),
    ).toBe("[value s]");
    const { type: _type, ...metadata } = scalar("union") as DataType & {
      type: "number";
    };
    expect(
      getDataTypeLabelPreview(
        {
          ...metadata,
          label: undefined,
          allOf: [{ $ref: id("missing") }],
          anyOf: [
            { type: "number", label: { right: "m" } },
            { type: "string", label: { left: "$" } },
          ],
        },
        {},
      ),
    ).toBe("(value m | $value)");
  });

  it("distinguishes labels on each list item from labels on the list itself", () => {
    const list = scalar("list", {
      type: "array",
      items: { type: "number", label: { right: "m" } },
    });
    expect(getDataTypeLabelPreview(list, {})).toBe("[value m, value m, …]");
    expect(
      getDataTypeLabelPreview(
        {
          ...list,
          type: "array",
          items: { type: "number" },
          label: { right: "m" },
        },
        {},
      ),
    ).toBe("[value, value, …] m");
    expect(
      getDataTypeLabelPreview(
        { ...list, label: { left: "(", right: ")" } },
        {},
      ),
    ).toBe("([value m, value m, …] )");
  });

  it("preserves tuple order and fixed arity", () => {
    const tuple = scalar("tuple", {
      type: "array",
      items: false,
      prefixItems: [
        { type: "number", label: { right: "m" } },
        { type: "number", label: { right: "s" } },
      ],
    });
    expect(getDataTypeLabelPreview(tuple, {})).toBe("[value m, value s]");
  });

  it("inherits the referenced tuple shape while letting the child replace its outer label", () => {
    const tuple = scalar("tuple", {
      type: "array",
      items: false,
      prefixItems: [
        { type: "number", label: { right: "m" } },
        { type: "number", label: { right: "s" } },
      ],
      label: { right: "coordinate" },
    });
    const child = scalar("child", {
      type: "array",
      allOf: [{ $ref: tuple.$id }],
    });
    const later = {
      ...tuple,
      $id: tuple.$id.replace("/v/1", "/v/2") as VersionedUrl,
      type: "array" as const,
      items: { type: "number" as const, label: { right: "ft" } },
    };
    const types = lookup(tuple, later);
    expect(getDataTypeLabelPreview(child, types)).toBe(
      "[value m, value s] coordinate",
    );
    expect(
      getDataTypeLabelPreview({ ...child, label: { right: "point" } }, types),
    ).toBe("[value m, value s] point");
  });

  it("combines inherited item labels and the tightest list length across parents", () => {
    const list = scalar("list", {
      type: "array",
      items: { type: "number", label: { right: "m" } },
      maxItems: 2,
    });
    const single = scalar("single", {
      type: "array",
      minItems: 1,
      maxItems: 1,
    });
    const child = scalar("child", {
      type: "array",
      items: { type: "number", minimum: 0 },
      maxItems: 3,
      allOf: [{ $ref: list.$id }, { $ref: single.$id }],
    });
    const grandchild = scalar("grandchild", {
      type: "array",
      allOf: [{ $ref: child.$id }],
    });
    const types = lookup(list, single, child);
    expect(getDataTypeLabelPreview(grandchild, types)).toBe("[value m]");
    expect(
      getDataTypeLabelPreview(
        {
          ...child,
          type: "array",
          items: { type: "number", label: { right: "ft" } },
        },
        types,
      ),
    ).toBe("[value ft]");
  });

  it("does not choose arbitrarily between conflicting inherited item labels", () => {
    const meters = scalar("meters", {
      type: "array",
      items: { type: "number", label: { right: "m" } },
    });
    const feet = scalar("feet", {
      type: "array",
      items: { type: "number", label: { right: "ft" } },
    });
    const child = scalar("child", {
      type: "array",
      maxItems: 1,
      label: { right: "measurements" },
      allOf: [{ $ref: meters.$id }, { $ref: feet.$id }],
    });
    expect(getDataTypeLabelPreview(child, lookup(meters, feet))).toBe(
      "[value] measurements",
    );
  });

  it("respects finite list lengths and empty tuples", () => {
    const list = scalar("list", {
      type: "array",
      maxItems: 1,
      items: { type: "number", label: { right: "m" } },
    });
    expect(getDataTypeLabelPreview(list, {})).toBe("[value m]");
    expect(
      getDataTypeLabelPreview(
        scalar("empty", { type: "array", items: false, label: { right: "m" } }),
        {},
      ),
    ).toBe("[] m");
  });

  it("keeps alternatives distinct and collapses identical formats", () => {
    const base = scalar("union");
    const { type: _type, ...metadata } = base as DataType & { type: "number" };
    const union: DataType = {
      ...metadata,
      anyOf: [
        { type: "number", label: { right: "m" } },
        { type: "number", label: { right: "ft" } },
      ],
    };
    expect(getDataTypeLabelPreview(union, {})).toBe("(value m | value ft)");
    expect(
      getDataTypeLabelPreview(
        {
          ...union,
          anyOf: [{ type: "number" }, { type: "string" }],
          label: { right: "m" },
        },
        {},
      ),
    ).toBe("value m");
  });

  it("keeps previews on one line even when a label contains line breaks", () => {
    expect(
      getDataTypeLabelPreview(
        scalar("multiline", { label: { right: "m\nper second" } }),
        {},
      ),
    ).toBe("value m per second");
  });

  it("applies the inherited union label once, with option labels taking precedence", () => {
    const parent = scalar("parent", { label: { left: "$", right: "/h" } });
    const { type: _type, ...metadata } = scalar("union") as DataType & {
      type: "number";
    };
    const union: DataType = {
      ...metadata,
      allOf: [{ $ref: parent.$id }],
      anyOf: [
        { type: "number", label: parent.label, minimum: 0, maximum: 10 },
        { type: "number", minimum: 20 },
      ],
    };
    const types = lookup(parent);
    expect(getDataTypeLabelPreview(union, types)).toBe("$value /h");
    expect(
      getDataTypeLabelPreview(
        {
          ...union,
          anyOf: [
            { type: "number", label: { left: "€" } },
            { type: "number", label: { right: "" } },
            { type: "number" },
          ],
        },
        types,
      ),
    ).toBe("(€value | value | $value /h)");
  });

  it("keeps item labels distinct from a union's label on the whole array", () => {
    const { type: _type, ...metadata } = scalar("union") as DataType & {
      type: "number";
    };
    const union: DataType = {
      ...metadata,
      label: { right: "m" },
      anyOf: [
        {
          type: "array",
          maxItems: 1,
          items: { type: "number", label: { right: "m" } },
          label: { right: "m" },
        },
      ],
    };
    expect(getDataTypeLabelPreview(union, {})).toBe("[value m] m");
  });

  it("bounds long uniform labels repeated across a large tuple", () => {
    const parent = scalar("parent", {
      type: "array",
      items: { type: "number", label: { right: "m".repeat(4096) } },
    });
    const tuple = scalar("tuple", {
      type: "array",
      items: false,
      prefixItems: repeated(2048, () => ({ type: "number" as const })),
      allOf: [{ $ref: parent.$id }],
    });
    const parts = getPreviewParts(tuple, lookup(parent))!;
    const text = parts.map((part) => part.text).join("");
    expect(text.length).toBeLessThanOrEqual(256);
    expect(text).toContain(`value ${"m".repeat(63)}…`);
    expect(text.endsWith("…")).toBe(true);
    expect(
      parts
        .filter(({ kind }) => kind === "label")
        .every(({ text: label }) => label.length <= 64),
    ).toBe(true);
  });

  it("does not inspect omitted tuple positions, including inherited shapes", () => {
    const prefixItems = repeated(9, () => ({
      type: "number" as const,
      label: { right: "m" },
    }));
    Object.defineProperty(prefixItems, 8, {
      get: () => {
        throw new Error("Omitted tuple position was read");
      },
    });
    const tuple = scalar("tuple", { type: "array", items: false, prefixItems });
    const child = scalar("child", {
      type: "array",
      allOf: [{ $ref: tuple.$id }],
    });
    const expected = `[${Array.from({ length: 8 }, () => "value m").join(", ")}, …]`;
    expect(getDataTypeLabelPreview(tuple, {})).toBe(expected);
    expect(getDataTypeLabelPreview(child, lookup(tuple))).toBe(expected);
  });

  it("bounds union alternatives before inspecting or formatting them", () => {
    const { type: _type, ...metadata } = scalar("union") as DataType & {
      type: "number";
    };
    const anyOf = repeated<SingleValueSchema>(1024, (index) => ({
      type: "number",
      label: { right: `unit ${index}` },
    }));
    Object.defineProperty(anyOf, 8, {
      get: () => {
        throw new Error("Omitted union alternative was read");
      },
    });
    const text = getDataTypeLabelPreview({ ...metadata, anyOf }, {});
    expect(text).toBe(
      `(${Array.from({ length: 8 }, (_, index) => `value unit ${index}`).join(" | ")} | …)`,
    );
  });

  it("bounds the total text of individually short union alternatives", () => {
    const { type: _type, ...metadata } = scalar("union") as DataType & {
      type: "number";
    };
    const text = getDataTypeLabelPreview(
      {
        ...metadata,
        anyOf: repeated<SingleValueSchema>(8, (index) => ({
          type: "number",
          label: { left: `${index}${"x".repeat(40)}`, right: "y".repeat(40) },
        })),
      },
      {},
    )!;
    expect(text.length).toBeLessThanOrEqual(256);
    expect(text.startsWith("(0")).toBe(true);
    expect(text.endsWith("…")).toBe(true);
  });

  it("bounds array alternatives and ordinary lists with long labels on both sides", () => {
    const { type: _type, ...metadata } = scalar("union") as DataType & {
      type: "number";
    };
    const label = { left: "$".repeat(4096), right: "m".repeat(4096) };
    const parent = scalar("parent", {
      type: "array",
      items: { type: "number", label },
    });
    const schemas: DataType[] = [
      parent,
      {
        ...metadata,
        allOf: [{ $ref: parent.$id }],
        anyOf: [
          {
            type: "array" as const,
            items: false as const,
            prefixItems: repeated(2048, () => ({
              type: "number" as const,
            })),
          },
        ],
      },
    ];
    for (const schema of schemas) {
      const text = getDataTypeLabelPreview(schema, lookup(parent))!;
      expect(text.length).toBeLessThanOrEqual(256);
      expect(text).toContain("…");
    }
  });

  it("compares full inherited labels before truncating their shared prefix", () => {
    const common = "x".repeat(100);
    const parents = ["a", "b"].map((suffix) =>
      scalar(suffix, {
        type: "array",
        label: { right: `${common}${suffix}` },
        items: { type: "number", label: { right: `${common}${suffix}` } },
      }),
    );
    const child = scalar("child", {
      type: "array",
      maxItems: 1,
      allOf: parents.map(({ $id }) => ({ $ref: $id })),
    });
    expect(getDataTypeLabelPreview(child, lookup(...parents))).toBeUndefined();
    expect(
      getDataTypeLabelPreview(
        { ...child, label: { right: "measurements" } },
        lookup(...parents),
      ),
    ).toBe("[value] measurements");
  });

  it("truncates and normalizes label text without splitting Unicode characters", () => {
    expect(
      getDataTypeLabelPreview(
        scalar("unicode", {
          label: {
            left: `${"x".repeat(62)}💡rest`,
            right: `m\n${"s".repeat(100)}`,
          },
        }),
        {},
      ),
    ).toBe(`${"x".repeat(62)}…value m ${"s".repeat(61)}…`);
    const tuple = scalar("unicode-tuple", {
      type: "array",
      items: false,
      prefixItems: repeated(8, () => ({
        type: "number" as const,
        label: { right: "💡".repeat(20) },
      })),
    });
    const text = getDataTypeLabelPreview(tuple, {})!;
    expect(text.length).toBeLessThanOrEqual(256);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u,
    );
  });
});
