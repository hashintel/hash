import { describe, test, expect } from "vitest";
import { sum } from "@local/effect-dns-hickory";

describe("example", () => {
  test("should work", () => {
    expect(sum(1, 2)).toBe(3);
  });
});
