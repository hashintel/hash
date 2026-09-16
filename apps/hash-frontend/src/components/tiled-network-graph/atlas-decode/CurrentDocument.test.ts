import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";

import * as CurrentDocument from "./CurrentDocument";
import * as GenerationId from "./GenerationId";
import * as Result from "./Result";

describe("CurrentDocument", () => {
  it("generation_only", () => {
    const generation = "01".repeat(32);
    const document = Result.unwrap(
      CurrentDocument.decode({
        generation,
        wireVersion: "ignored",
        authority: "ignored",
      }),
    );
    expect(document.generation.toString()).toBe(generation);
    expect(
      document.generation.equals(
        Result.unwrap(GenerationId.fromHex(generation)),
      ),
    ).toBe(true);
    expect(Object.keys(document)).toEqual(["generation"]);
    expect(Object.isFrozen(document)).toBe(false);
    expectTypeOf(document).toEqualTypeOf<{
      readonly generation: GenerationId.GenerationId;
    }>();
  });

  it("schema_errors", () => {
    const result = CurrentDocument.decode({});
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error.cause).toBeInstanceOf(z.ZodError);
      if (result.error.cause instanceof z.ZodError) {
        expect(result.error.cause.issues[0]?.path).toEqual(["generation"]);
      }
    }
  });

  it.each(["", "00".repeat(31), "AB".repeat(32)])(
    "generation_errors_%s",
    (generation) => {
      const result = CurrentDocument.decode({ generation });
      expect(Result.isErr(result)).toBe(true);
      if (Result.isErr(result)) {
        expect(result.error.cause).toBeInstanceOf(
          GenerationId.GenerationIdError,
        );
      }
    },
  );
});
