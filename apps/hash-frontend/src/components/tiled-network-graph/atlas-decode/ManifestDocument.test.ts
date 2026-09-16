import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";

import * as GenerationId from "./GenerationId";
import * as Manifest from "./ManifestDocument";
import * as Result from "./Result";

const input = () => ({
  generation: "ab".repeat(32),
  wireVersion: 1,
  variants: ["plain"],
  bucketSchedule: { span: 4, cut: "z+2", maxZoom: 12 },
  scopeSchedule: { k: 3, cut: "z+2", maxZoom: 7 },
  limits: {
    tile: { coloredTypeIds: 32 },
    edges: { tiles: 256, edges: 16384 },
    locate: {
      coloredTypeIds: 32,
      edges: 512,
      properties: 10,
      linkTypeIds: 5,
      linkProperties: 10,
    },
    translate: { entityIds: 1024 },
    authorityRefreshSeconds: 480,
    authorityHardSeconds: 600,
  },
});

const decodeOptions = {
  generation: GenerationId.GenerationId.fromHex(input().generation).pipe(
    Result.unwrap,
  ),
};

describe("Manifest", () => {
  it("generation_mismatch", () => {
    const generation = GenerationId.GenerationId.fromHex("cd".repeat(32)).pipe(
      Result.unwrap,
    );
    const result = Manifest.decode(input(), { generation });
    expect(Result.isErr(result)).toBe(true);
    if (
      !Result.isErr(result) ||
      result.error.reason._tag !== "generation-mismatch"
    ) {
      throw new Error("expected a generation mismatch");
    }
    expect(result.error.reason.expected).toBe(generation);
    expect(result.error.reason.actual.equals(decodeOptions.generation)).toBe(
      true,
    );
  });

  it.each([0, 2, 0xffff])("unsupported_wire_version_%s", (wireVersion) => {
    const result = Manifest.decode({ ...input(), wireVersion }, decodeOptions);
    expect(Result.isErr(result)).toBe(true);
    if (!Result.isErr(result) || !(result.error.cause instanceof z.ZodError)) {
      throw new Error("expected a schema error");
    }
    expect(result.error.cause.issues.map((issue) => issue.path)).toEqual([
      ["wireVersion"],
    ]);
  });

  it("empty_variants", () => {
    const result = Manifest.decode({ ...input(), variants: [] }, decodeOptions);
    expect(Result.isErr(result)).toBe(true);
    if (!Result.isErr(result) || !(result.error.cause instanceof z.ZodError)) {
      throw new Error("expected a schema error");
    }
    expect(result.error.cause.issues.map((issue) => issue.path)).toEqual([
      ["variants"],
    ]);
  });

  it("nested_limits", () => {
    const document = Result.unwrap(Manifest.decode(input()));
    expect(document.generation).toBeInstanceOf(GenerationId.GenerationId);
    expect(document.generation.toString()).toBe(input().generation);
    expect(document.bucketSchedule.maxZoom).toBe(12);
    expect(document.scopeSchedule.maxZoom).toBe(7);
    expect(document.limits).toEqual(input().limits);
    expect(document).not.toHaveProperty("authority");
    expect(document).not.toHaveProperty("createdAt");
    expect(Object.keys(document.limits.tile)).toEqual(["coloredTypeIds"]);
    expect(Object.keys(document.limits.translate)).toEqual(["entityIds"]);
  });

  it("optional_created_at_unknown_keys", () => {
    const document = Result.unwrap(
      Manifest.decode({
        ...input(),
        createdAt: "2026-09-16T00:00:00Z",
        authority: "header-only",
        extra: true,
      }),
    );
    expect(document.createdAt).toBe("2026-09-16T00:00:00Z");
    expect(document).not.toHaveProperty("authority");
    expect(document).not.toHaveProperty("extra");
  });

  it("schema_issues", () => {
    const value = input();
    const result = Manifest.decode({
      ...value,
      variants: [5],
      limits: {
        ...value.limits,
        locate: { ...value.limits.locate, edges: "512" },
        tile: {},
      },
    });
    expect(Result.isErr(result)).toBe(true);
    if (!Result.isErr(result)) {
      return;
    }
    expect(result.error.cause).toBeInstanceOf(z.ZodError);
    const cause = result.error.cause;
    if (!(cause instanceof z.ZodError)) {
      return;
    }
    expect(cause.issues.map((issue) => issue.path)).toEqual([
      ["variants", 0],
      ["limits", "tile", "coloredTypeIds"],
      ["limits", "locate", "edges"],
    ]);
  });

  it("generation_errors", () => {
    const result = Manifest.decode({ ...input(), generation: "AB".repeat(32) });
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error.reason._tag).toBe("schema");
      const cause = result.error.cause;
      expect(cause).toBeInstanceOf(z.ZodError);
      if (!(cause instanceof z.ZodError)) {
        return;
      }
      const issue = cause.issues[0];
      expect(issue?.path).toEqual(["generation"]);
      expect(issue?.code).toBe("custom");
      if (issue?.code === "custom") {
        expect(issue.params?.cause).toBeInstanceOf(
          GenerationId.GenerationIdError,
        );
      }
    }
  });

  it.each(["2026-09-16T00:00:00Z", "2026-09-16T02:03:04.123456789+02:00"])(
    "iso_timestamp_%s",
    (createdAt) => {
      expect(
        Result.unwrap(Manifest.decode({ ...input(), createdAt })).createdAt,
      ).toBe(createdAt);
    },
  );

  it.each([
    "not-a-date",
    "2026-02-29T00:00:00Z",
    "2026-09-16",
    "2026-09-16T00:00:00",
    null,
  ])("invalid_timestamp_%s", (createdAt) => {
    const result = Manifest.decode({ ...input(), createdAt });
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error.cause).toBeInstanceOf(z.ZodError);
      if (result.error.cause instanceof z.ZodError) {
        expect(result.error.cause.issues[0]?.path).toEqual(["createdAt"]);
      }
    }
  });

  it.each([0, 0.5, 3, 2 ** 52 - 1, 2 ** 63 - 1024, 2 ** 64])(
    "invalid_span_%s",
    (span) => {
      const value = input();
      expect(
        Result.isErr(
          Manifest.decode({
            ...value,
            bucketSchedule: { ...value.bucketSchedule, span },
          }),
        ),
      ).toBe(true);
    },
  );

  it.each([1, 4, 2 ** 52, 2 ** 63])("power_of_two_span_%s", (span) => {
    const value = input();
    expect(
      Result.unwrap(
        Manifest.decode({
          ...value,
          bucketSchedule: { ...value.bucketSchedule, span },
        }),
      ).bucketSchedule.span,
    ).toBe(span);
  });

  it.each(["opaque", "z+-1", "z+64", "z+02", "z+2\n"])(
    "invalid_cut_%s",
    (cut) => {
      const value = input();
      expect(
        Result.isErr(
          Manifest.decode({
            ...value,
            bucketSchedule: { ...value.bucketSchedule, cut },
          }),
        ),
      ).toBe(true);
      expect(
        Result.isErr(
          Manifest.decode({
            ...value,
            scopeSchedule: { ...value.scopeSchedule, cut },
          }),
        ),
      ).toBe(true);
    },
  );

  it("encoded_ranges", () => {
    const value = input();
    expect(
      Result.isErr(Manifest.decode({ ...value, wireVersion: 2 ** 16 })),
    ).toBe(true);
    expect(Result.isErr(Manifest.decode({ ...value, variants: [""] }))).toBe(
      true,
    );
    expect(
      Result.isErr(
        Manifest.decode({
          ...value,
          scopeSchedule: { ...value.scopeSchedule, k: 33 },
        }),
      ),
    ).toBe(true);
    expect(
      Result.isErr(
        Manifest.decode({
          ...value,
          bucketSchedule: { ...value.bucketSchedule, maxZoom: 33 },
        }),
      ),
    ).toBe(true);
    expect(
      Result.isErr(
        Manifest.decode({
          ...value,
          limits: { ...value.limits, edges: { tiles: 2 ** 32, edges: 1 } },
        }),
      ),
    ).toBe(true);
    const document = Result.unwrap(
      Manifest.decode({
        ...value,
        bucketSchedule: { span: 2 ** 63, cut: "z+63", maxZoom: 32 },
        scopeSchedule: { k: 32, cut: "z+0", maxZoom: 32 },
      }),
    );
    expect(document.bucketSchedule.maxZoom).toBe(32);
  });

  it("generation_and_field_issues", () => {
    const result = Manifest.decode({
      ...input(),
      generation: "AB".repeat(32),
      createdAt: "invalid",
    });
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result) && result.error.cause instanceof z.ZodError) {
      expect(result.error.cause.issues.map((issue) => issue.path)).toEqual([
        ["generation"],
        ["createdAt"],
      ]);
    }
  });

  it("readonly_output", () => {
    const document = Result.unwrap(Manifest.decode(input()));
    expectTypeOf(document.variants).toEqualTypeOf<readonly string[]>();
    expectTypeOf(document.scopeSchedule).toEqualTypeOf<{
      readonly k: number;
      readonly cut: string;
      readonly maxZoom: number;
    }>();
    expect(Object.isFrozen(document)).toBe(false);
    expect(Object.isFrozen(document.limits)).toBe(false);
    expect(Object.isFrozen(document.variants)).toBe(false);
    const overwrite = () => {
      // @ts-expect-error: The public output is readonly at nested fields.
      document.limits.locate.edges = 1;
    };
    expectTypeOf(overwrite).toBeFunction();
  });

  it("independent_fields", () => {
    const value = input();
    expect(
      Result.isOk(
        Manifest.decode({
          ...value,
          wireVersion: 2,
          variants: [],
          bucketSchedule: { span: 4, cut: "z+2", maxZoom: 0 },
          limits: {
            ...value.limits,
            authorityRefreshSeconds: 10,
            authorityHardSeconds: 1,
          },
        }),
      ),
    ).toBe(true);
  });
});
