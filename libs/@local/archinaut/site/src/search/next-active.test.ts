import { describe, expect, it } from "vitest";

import { nextActive } from "./next-active";

describe("nextActive", () => {
  it("moves down and stops at the last hit", () => {
    expect(nextActive(0, "ArrowDown", 3)).toBe(1);
    expect(nextActive(2, "ArrowDown", 3)).toBe(2);
  });

  it("moves up and stops at the first hit", () => {
    expect(nextActive(2, "ArrowUp", 3)).toBe(1);
    expect(nextActive(0, "ArrowUp", 3)).toBe(0);
  });

  it("stays at zero when there are no hits", () => {
    expect(nextActive(0, "ArrowDown", 0)).toBe(0);
    expect(nextActive(0, "ArrowUp", 0)).toBe(0);
  });

  it("ignores every other key", () => {
    expect(nextActive(1, "Enter", 3)).toBeNull();
    expect(nextActive(1, "a", 3)).toBeNull();
  });
});
