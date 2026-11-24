import { describe, expect, it } from "vitest";

import { codeLiteral } from "./code-literal";

describe("codeLiteral", () => {
  it("writes a value that evaluates back to itself", () => {
    const value = {
      title: "A <script> & </script>",
      path: "@decks/a/0-b.mdx",
      line: "\u2028",
    };
    const literal = codeLiteral(value);
    expect(literal).not.toMatch(/[<>\u2028]/u);
    expect(JSON.parse(literal)).toEqual(value);
  });
});
