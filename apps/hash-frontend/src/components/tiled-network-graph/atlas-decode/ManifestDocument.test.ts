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

describe("Manifest", () => {
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
      expect(result.error.reason._tag).toBe("generation");
      expect(result.error.cause).toBeInstanceOf(GenerationId.GenerationIdError);
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
          bucketSchedule: { span: 3, cut: "opaque", maxZoom: 0 },
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
