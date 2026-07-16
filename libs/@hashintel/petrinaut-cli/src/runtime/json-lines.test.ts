import { describe, expect, it } from "vitest";

import { consumeBufferedJsonLines } from "./json-lines";

describe("consumeBufferedJsonLines", () => {
  it("applies the byte limit to each line instead of the combined buffer", () => {
    expect(consumeBufferedJsonLines("12345678\nabcdefgh\n", 10)).toEqual({
      lines: ["12345678", "abcdefgh"],
      remainder: "",
      requestTooLarge: false,
    });
  });

  it("rejects an oversized complete or partial line", () => {
    expect(consumeBufferedJsonLines("ok\n123456", 5)).toEqual({
      lines: ["ok"],
      remainder: "123456",
      requestTooLarge: true,
    });
    expect(consumeBufferedJsonLines("123456\n", 5)).toEqual({
      lines: [],
      remainder: "",
      requestTooLarge: true,
    });
  });
});
