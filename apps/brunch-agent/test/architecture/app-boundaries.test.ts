import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  AGENT_DIRECTIVE_STATEMENT,
  APP_ROOT,
  isAgentModule,
  pinnedIdentities,
  sourceFiles,
} from "./app-workspace";

const appSourceFiles = sourceFiles();
const agentModules = appSourceFiles.filter(isAgentModule);

describe("the Brunch application owns its agent registration", () => {
  test("has at least one agent module", () => {
    expect(agentModules.length).toBeGreaterThan(0);
  });

  test("'use agent' is each agent module's first statement", () => {
    for (const file of agentModules) {
      const withoutLeadingComments = file.text
        .replace(/^﻿/u, "")
        .replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/u, "");
      const firstStatement = withoutLeadingComments.split("\n")[0] ?? "";
      expect({
        file: file.relPath,
        firstStatementIsDirective:
          AGENT_DIRECTIVE_STATEMENT.test(firstStatement),
      }).toEqual({ file: file.relPath, firstStatementIsDirective: true });
    }
  });

  test("agentName is a pinned string literal", () => {
    for (const file of agentModules) {
      const identities = pinnedIdentities(file);
      expect({ file: file.relPath, pinned: identities.length > 0 }).toEqual({
        file: file.relPath,
        pinned: true,
      });
      for (const identity of identities) {
        expect(identity).toMatch(/^[a-z][a-z0-9-]*$/u);
      }
    }
  });

  test("a pinned identity appears only in its own agent module", () => {
    const identities = agentModules.flatMap((file) =>
      pinnedIdentities(file).map((identity) => ({
        identity,
        pinnedIn: file.relPath,
      })),
    );
    expect(identities.length).toBeGreaterThan(0);

    const stringLiteral = /(['"`])(?:\\.|(?!\1)[^\\\n])*\1/gu;
    for (const { identity, pinnedIn } of identities) {
      const duplicatedIn = appSourceFiles
        .filter((file) => file.relPath !== pinnedIn)
        .filter((file) =>
          (file.text.match(stringLiteral) ?? []).some((literal) =>
            literal.includes(identity),
          ),
        )
        .map((file) => file.relPath);
      expect({ identity, duplicatedIn }).toEqual({
        identity,
        duplicatedIn: [],
      });
    }
  });

  test("owns the mount and conversation store", () => {
    for (const file of ["src/app.ts", "src/db.ts"]) {
      expect(() => readFileSync(join(APP_ROOT, file), "utf8")).not.toThrow();
    }
  });
});
