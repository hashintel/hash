import { describe, expect, it } from "vitest";

import { getDataTypeLabelPreview as getPreviewParts } from "./data-type-label-preview";

import type {
  DataType,
  DataTypeWithMetadata,
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
    const child = scalar("child", { allOf: [{ $ref: id("parent") }] });
    const parent = scalar("parent", { allOf: [{ $ref: child.$id }] });
    expect(getDataTypeLabelPreview(child, {})).toBeUndefined();
    expect(
      getDataTypeLabelPreview(child, lookup(parent, child)),
    ).toBeUndefined();
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
});
