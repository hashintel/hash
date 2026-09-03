import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

const fixtureDirectory = fileURLToPath(
  new URL(
    "../../../libs/@hashintel/brunch-agent/docs/inbox/sdcpn-examples-to-validate/",
    import.meta.url,
  ),
);

describe("inbox SDCPN examples", () => {
  const fixtureNames = readdirSync(fixtureDirectory)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  test("are present", () => {
    expect(fixtureNames.length).toBeGreaterThan(0);
  });

  test.each(fixtureNames)("%s parses with parseSDCPNFile", (fileName) => {
    const parsed = parseSDCPNFile(
      JSON.parse(readFileSync(join(fixtureDirectory, fileName), "utf8")),
    );
    expect(parsed.ok, fileName).toBe(true);
  });
});
