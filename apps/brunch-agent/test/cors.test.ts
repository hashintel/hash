import { describe, expect, test } from "vitest";

import {
  BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
  parseCorsAllowedOrigins,
} from "../src/http/cors.ts";

describe("parseCorsAllowedOrigins", () => {
  test("grants no cross-origin access when configuration is absent or blank", () => {
    expect(parseCorsAllowedOrigins(undefined)).toEqual([]);
    expect(parseCorsAllowedOrigins("   ")).toEqual([]);
  });

  test("normalizes and deduplicates exact HTTP origins", () => {
    expect(
      parseCorsAllowedOrigins(
        " https://demo.petrinaut.org/, HTTPS://PETRINAUT.STAGE.HASH.AI:443, https://demo.petrinaut.org ",
      ),
    ).toEqual([
      "https://demo.petrinaut.org",
      "https://petrinaut.stage.hash.ai",
    ]);
  });

  test.each([
    "ftp://demo.petrinaut.org",
    "https://user:secret@demo.petrinaut.org",
    "https://demo.petrinaut.org/path",
    "https://demo.petrinaut.org?preview=true",
    "https://demo.petrinaut.org#preview",
    "https://*.stage.hash.ai",
    "not-an-origin",
  ])("rejects invalid or broader-than-origin entry %s", (value) => {
    expect(() => parseCorsAllowedOrigins(value)).toThrow(
      BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
    );
  });
});
