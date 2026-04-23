import { existsSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createNodeSpecifierResolver,
  createPetrinautPandaConfig,
  DS_COMPONENTS_BUILD_INFO_SUBPATH,
  resolveDsComponentsBuildInfoPath,
} from "./panda.config.shared";

describe("createNodeSpecifierResolver", () => {
  it("resolves the shipped ds-components Panda build-info file from the consumer module", () => {
    const resolve = createNodeSpecifierResolver(import.meta.url);

    expect(resolveDsComponentsBuildInfoPath(resolve)).toMatch(
      /libs\/[@]hashintel\/ds-components\/dist\/panda\.buildinfo\.json$/,
    );
  });

  it("resolves to an existing build-info artifact", () => {
    const resolve = createNodeSpecifierResolver(import.meta.url);

    expect(existsSync(resolveDsComponentsBuildInfoPath(resolve))).toBe(true);
  });
});

describe("resolveDsComponentsBuildInfoPath", () => {
  it("resolves the shipped ds-components Panda build-info subpath", () => {
    const resolve = vi.fn((specifier: string) => `/virtual/${specifier}`);

    expect(resolveDsComponentsBuildInfoPath(resolve)).toBe(
      `/virtual/${DS_COMPONENTS_BUILD_INFO_SUBPATH}`,
    );
    expect(resolve).toHaveBeenCalledWith(DS_COMPONENTS_BUILD_INFO_SUBPATH);
  });
});

describe("createPetrinautPandaConfig", () => {
  it("includes the shipped build-info file instead of ds-components source globs", () => {
    const config = createPetrinautPandaConfig(
      "/virtual/ds-components/panda.buildinfo.json",
    );

    expect(config.include).toContain(
      "/virtual/ds-components/panda.buildinfo.json",
    );
    expect(config.include).not.toContain("../ds-components/src/**/*.{ts,tsx}");
  });
});
