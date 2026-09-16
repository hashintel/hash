import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { checkPersonaConfiguration } from "../src/evaluations/persona/configuration.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true });
});

const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), "TEST-persona-configuration-"));
  directories.push(directory);
  writeFileSync(
    join(directory, "settings.json"),
    JSON.stringify({ retry: { enabled: false, provider: { maxRetries: 0 } } }),
  );
  return {
    PI_CODING_AGENT_DIR: directory,
    PI_OFFLINE: "1",
    ANTHROPIC_API_KEY: "TEST-configuration-key",
  };
};

test("isolated Pi configuration needs no accounting allocation", () => {
  expect(checkPersonaConfiguration(setup())).toEqual({
    ANTHROPIC_API_KEY: "TEST-configuration-key",
  });
});

test("OpenAI persona requires and transfers only its selected provider credential", () => {
  const { ANTHROPIC_API_KEY: _unused, ...environment } = setup();
  expect(
    checkPersonaConfiguration(
      { ...environment, OPENAI_API_KEY: "TEST-openai-key" },
      "openai/gpt-5.6-sol",
    ),
  ).toEqual({ OPENAI_API_KEY: "TEST-openai-key" });
  expect(() =>
    checkPersonaConfiguration(setup(), "openai/gpt-5.6-sol"),
  ).toThrow(/configuration refused/);
});

test("an unrelated provider credential does not satisfy an Anthropic persona", () => {
  const { ANTHROPIC_API_KEY: _unused, ...environment } = setup();
  expect(() =>
    checkPersonaConfiguration({
      ...environment,
      OPENAI_API_KEY: "TEST-openai-key",
    }),
  ).toThrow(/configuration refused/);
});

test.each(["auth.json", "models.json"])(
  "%s cannot introduce another credential or model source",
  (file) => {
    const environment = setup();
    writeFileSync(
      join(environment.PI_CODING_AGENT_DIR, file),
      JSON.stringify({ anthropic: { type: "oauth" } }),
    );
    expect(() => checkPersonaConfiguration(environment)).toThrow(
      /configuration refused/,
    );
  },
);
