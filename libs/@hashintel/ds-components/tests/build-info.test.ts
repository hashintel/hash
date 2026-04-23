import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const petrinautPackageDirectory = new URL("../../petrinaut/", import.meta.url);
const buildInfoPath = require.resolve(
  "@hashintel/ds-components/panda.buildinfo.json",
  { paths: [petrinautPackageDirectory.pathname] },
);

describe("package build-info contract", () => {
  it("resolves the shipped build-info artifact from a consumer package", () => {
    expect(buildInfoPath).toMatch(
      /libs\/[@]hashintel\/ds-components\/dist\/panda\.buildinfo\.json$/,
    );
    expect(buildInfoPath).not.toContain("/src/");
  });

  it("points consumers at an existing build-info artifact", () => {
    expect(existsSync(buildInfoPath)).toBe(true);
  });
});
