import { describe, expect, it } from "vitest";

import { colorElementSchema } from "../../schemas/entity-schemas";
import { computeTokenSlotLayout } from "./token-layout";
import { coerceTokenAttributeValue } from "./token-values";
import { COLOR_ELEMENT_TYPES, TYPE_POLICIES } from "./type-policies";

import type { Color, ColorElementType } from "../../types/sdcpn";
import type { PhysicalKind } from "./type-policies";

type ColorElement = Color["elements"][number];

const element = (type: ColorElementType): ColorElement => ({
  elementId: `${type}_element`,
  name: `${type}_element`,
  type,
});

/** Byte width and alignment of each physical kind in the packed layout. */
const PHYSICAL_WIDTHS: Record<
  PhysicalKind,
  { byteSize: number; align: number }
> = {
  f64: { byteSize: 8, align: 8 },
  u8: { byteSize: 1, align: 1 },
  u64: { byteSize: 8, align: 8 },
  u64x2: { byteSize: 16, align: 8 },
};

/**
 * Conformance test for the type-policy registry: adding a sixth
 * `ColorElementType` must fail loudly here (and at compile time via the
 * `Record<ColorElementType, TypePolicy>` shape of `TYPE_POLICIES`) until
 * every touchpoint is defined.
 */
describe("TYPE_POLICIES", () => {
  it("covers exactly the canonical ColorElementType list", () => {
    expect(Object.keys(TYPE_POLICIES).sort()).toEqual(
      [...COLOR_ELEMENT_TYPES].sort(),
    );
  });

  it("matches the zod colour element schema's enum", () => {
    expect(colorElementSchema.shape.type.options).toEqual([
      ...COLOR_ELEMENT_TYPES,
    ]);
  });

  describe.each(COLOR_ELEMENT_TYPES)("%s", (type) => {
    const policy = TYPE_POLICIES[type];

    it("has every field populated", () => {
      expect(Object.keys(PHYSICAL_WIDTHS)).toContain(policy.physicalKind);
      expect(policy.defaultValue).toBeDefined();
      expect(policy.defaultValueSource).not.toBe("");
      expect(policy.tsInputType).not.toBe("");
      expect(policy.tsKernelOutputType).not.toBe("");
      expect(typeof policy.kernelOutputOptional).toBe("boolean");
      expect(typeof policy.coerce).toBe("function");
      expect(typeof policy.encodeAtRest).toBe("function");
      expect(typeof policy.parseEditorText).toBe("function");
    });

    it("agrees with computeTokenSlotLayout on the physical layout", () => {
      const layout = computeTokenSlotLayout([element(type)]);

      expect(layout.fields).toHaveLength(1);
      const field = layout.fields[0]!;
      const physical = PHYSICAL_WIDTHS[policy.physicalKind];
      expect(field.kind).toBe(policy.physicalKind);
      expect(field.byteSize).toBe(physical.byteSize);
      expect(field.byteOffset % physical.align).toBe(0);
      expect(layout.strideBytes).toBeGreaterThanOrEqual(physical.byteSize);
    });

    it("carries a number-slot decoder exactly for f64/u8 kinds", () => {
      const isNumberSlot =
        policy.physicalKind === "f64" || policy.physicalKind === "u8";
      expect(policy.decodeNumberSlot !== null).toBe(isNumberSlot);
    });

    it("round-trips the default value through coercion unchanged", () => {
      expect(
        coerceTokenAttributeValue(
          element(type),
          policy.defaultValue,
          "conformance",
        ),
      ).toBe(policy.defaultValue);
      expect(policy.coerce(policy.defaultValue, "conformance")).toBe(
        policy.defaultValue,
      );
    });

    it("encodes at rest to a JSON-serializable value", () => {
      const stored = policy.encodeAtRest(policy.defaultValue);
      expect(typeof stored).not.toBe("bigint");
      expect(() => JSON.stringify(stored)).not.toThrow();
      expect(JSON.stringify(stored)).toBeDefined();
    });

    it("parses editor text totally (empty input yields a value of the type)", () => {
      const parsed = policy.parseEditorText("");
      // The parsed empty-input value must itself coerce cleanly.
      expect(policy.coerce(parsed, "conformance")).toBe(parsed);
    });
  });
});
