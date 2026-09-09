import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { paneIdFrom, personaArguments, readPersonaCase } from "./launch.ts";

test.each([true, false])(
  "reads a generic case and separates the public opening (header: %s)",
  async (header) => {
    const directory = await mkdtemp(join(tmpdir(), "brunch-launch-test-"));
    try {
      await Promise.all([
        writeFile(join(directory, "situation-pack.md"), "PRIVATE background"),
        writeFile(
          join(directory, "opening-message.md"),
          `${header ? "PRIVATE operator note\n\n---\n\n" : ""}Hello, please interview me.\n`,
        ),
      ]);
      expect(await readPersonaCase(directory)).toEqual({
        pack: "PRIVATE background",
        opening: "Hello, please interview me.",
      });
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

test("launches a fresh restricted persona using input files, not prior session or private content arguments", () => {
  const args = personaArguments("/tmp/TEST-persona", "claude-sonnet-4-6");
  expect(args).toContain("anthropic/claude-sonnet-4-6");
  expect(args).toContain("brunch_turn");
  expect(args).toContain("--no-context-files");
  expect(args).toContain("--no-builtin-tools");
  expect(args).toContain("--no-extensions");
  expect(args).toContain("--no-approve");
  expect(args).toContain("/tmp/TEST-persona/session.json");
  expect(args.at(-1)).toBe("@/tmp/TEST-persona/persona-input.md");
  expect(args).not.toContain("--session");
  expect(args).not.toContain("--continue");
  expect(args).not.toContain("--api-key");
});

test("reads the pane id from herdr's split result", () => {
  expect(
    paneIdFrom(
      '{"id":"cli:pane:split","result":{"pane":{"pane_id":"w0:p23"}},"type":"pane_split"}',
    ),
  ).toBe("w0:p23");
});
