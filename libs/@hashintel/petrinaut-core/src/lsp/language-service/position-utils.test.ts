import { describe, expect, it } from "vitest";
import { Position } from "vscode-languageserver-types";

import { offsetToPosition, positionToOffset } from "./position-utils";

describe("offsetToPosition", () => {
  it("returns 0:0 for offset 0", () => {
    expect(offsetToPosition("hello", 0)).toEqual(Position.create(0, 0));
  });

  it("returns correct position within a single line", () => {
    expect(offsetToPosition("hello", 3)).toEqual(Position.create(0, 3));
  });

  it("returns start of second line after newline", () => {
    expect(offsetToPosition("ab\ncd", 3)).toEqual(Position.create(1, 0));
  });

  it("returns correct position on second line", () => {
    expect(offsetToPosition("ab\ncd", 4)).toEqual(Position.create(1, 1));
  });

  it("handles multiple newlines", () => {
    const text = "line1\nline2\nline3";
    // 'l' in line3 is at offset 12
    expect(offsetToPosition(text, 12)).toEqual(Position.create(2, 0));
    expect(offsetToPosition(text, 15)).toEqual(Position.create(2, 3));
  });

  it("clamps to end of text", () => {
    expect(offsetToPosition("ab", 100)).toEqual(Position.create(0, 2));
  });
});

describe("positionToOffset", () => {
  it("returns 0 for position 0:0", () => {
    expect(positionToOffset("hello", Position.create(0, 0))).toBe(0);
  });

  it("returns correct offset within a single line", () => {
    expect(positionToOffset("hello", Position.create(0, 3))).toBe(3);
  });

  it("returns offset at start of second line", () => {
    expect(positionToOffset("ab\ncd", Position.create(1, 0))).toBe(3);
  });

  it("returns correct offset on second line", () => {
    expect(positionToOffset("ab\ncd", Position.create(1, 1))).toBe(4);
  });

  it("handles multiple newlines", () => {
    const text = "line1\nline2\nline3";
    expect(positionToOffset(text, Position.create(2, 0))).toBe(12);
    expect(positionToOffset(text, Position.create(2, 3))).toBe(15);
  });
});

describe("roundtrip", () => {
  it("offsetToPosition → positionToOffset is identity", () => {
    const text = "function foo() {\n  return 42;\n}\n";
    for (let offset = 0; offset <= text.length; offset++) {
      const pos = offsetToPosition(text, offset);
      const recovered = positionToOffset(text, pos);
      expect(recovered).toBe(offset);
    }
  });
});
