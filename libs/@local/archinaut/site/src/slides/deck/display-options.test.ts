import { describe, expect, it } from "vitest";

import { parseSlideShape } from "./display-options";

describe("display options", () => {
  it("accepts only the offered slide shapes", () => {
    expect(parseSlideShape("16:9")).toBe("16:9");
    expect(parseSlideShape("4:3")).toBe("4:3");
    expect(parseSlideShape("responsive")).toBe("responsive");
    expect(parseSlideShape("21:9")).toBeUndefined();
    expect(parseSlideShape(null)).toBeUndefined();
  });
});
