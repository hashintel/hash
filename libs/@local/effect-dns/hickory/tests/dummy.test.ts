import { describe, it, expect } from "vitest";
import { sum } from "@local/effect-dns-hickory";

describe("example", () => {
  it("should work", () => {
    expect(sum(1, 2)).toBe(3);
  });
});
