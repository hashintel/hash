import { describe, expect, test } from "vitest";

import { isAgentModule, type SourceFile } from "./app-workspace";

const file = (text: string): SourceFile => ({
  path: "/fake/module.ts",
  relPath: "fake/module.ts",
  text,
});

describe("isAgentModule", () => {
  test("recognizes either quote style", () => {
    expect(isAgentModule(file("'use agent';\nexport {};\n"))).toBe(true);
    expect(isAgentModule(file('"use agent";\nexport {};\n'))).toBe(true);
  });

  test("allows leading comments and trailing directive comments", () => {
    expect(
      isAgentModule(
        file(
          "/** The agent. */\n'use agent'; // registers the agent\nexport {};\n",
        ),
      ),
    ).toBe(true);
  });

  test("does not confuse a comment for a directive", () => {
    expect(
      isAgentModule(
        file("// the 'use agent' directive must come first\nexport {};\n"),
      ),
    ).toBe(false);
  });

  test("detects a misplaced directive for the placement check", () => {
    expect(isAgentModule(file("import 'x';\n'use agent';\nexport {};\n"))).toBe(
      true,
    );
  });

  test("requires matching quotes", () => {
    expect(isAgentModule(file("'use agent\";\nexport {};\n"))).toBe(false);
  });
});
