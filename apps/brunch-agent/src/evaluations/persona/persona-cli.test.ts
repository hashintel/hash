import { expect, test } from "vitest";

import {
  personaCommandFromArguments,
  splitPersonaArguments,
} from "./persona-cli.ts";

test("a message that begins with a dash is text, not an option", async () => {
  const { options, positionals } = splitPersonaArguments([
    "say",
    "-5",
    "degrees",
    "is",
    "too",
    "cold",
  ]);
  expect(options).toEqual([]);
  await expect(personaCommandFromArguments(positionals)).resolves.toEqual({
    type: "prompt",
    message: "-5 degrees is too cold",
  });
});

test("the CLI's own flags stay options on either side of the command", () => {
  expect(
    splitPersonaArguments(["--socket", "/tmp/bridge", "say", "hi", "--json"]),
  ).toEqual({
    options: ["--socket", "/tmp/bridge", "--json"],
    positionals: ["say", "hi"],
  });
  expect(splitPersonaArguments(["say", "--", "--json", "is text"])).toEqual({
    options: [],
    positionals: ["say", "--json", "is text"],
  });
  // An unknown option before the command still reaches parseArgs and fails.
  expect(splitPersonaArguments(["--verbose", "state"]).options).toEqual([
    "--verbose",
  ]);
});
