import { existsSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { preset as dsComponentsPreset } from "@hashintel/ds-components/preset";

import {
  createNodeSpecifierResolver,
  createPetrinautPandaConfig,
  DS_COMPONENTS_BUILD_INFO_SUBPATH,
  resolveDsComponentsBuildInfoPath,
} from "./panda.config.shared";
import { petrinautPandaPreset } from "./src/panda-preset";

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

  it("includes the shared Petrinaut preset so hosts and this package compile against one theme contract", () => {
    const config = createPetrinautPandaConfig(
      "/virtual/ds-components/panda.buildinfo.json",
    );

    expect(config.presets).toContain(petrinautPandaPreset);
  });
});

describe("petrinautPandaPreset", () => {
  /**
   * Panda deep-merges same-name keyframes across presets rather than letting
   * one definition win. If a Petrinaut keyframe shared a name with a
   * ds-components (or bundled panda) keyframe, a host combining both presets
   * — e.g. the HASH frontend, which compiles Petrinaut's shipped Panda build
   * info through its own pipeline (FE-1228) — would silently mutate the
   * host-wide animation. All Petrinaut keyframes must therefore use names
   * that cannot collide with the design system's.
   */
  it("only defines keyframes that cannot collide with the ds-components preset", () => {
    const dsKeyframeNames = Object.keys(
      dsComponentsPreset.theme?.extend?.keyframes ?? {},
    );
    const petrinautKeyframeNames = Object.keys(
      petrinautPandaPreset.theme.extend.keyframes,
    );

    expect(dsKeyframeNames).not.toHaveLength(0);
    expect(
      petrinautKeyframeNames.filter((name) => dsKeyframeNames.includes(name)),
    ).toEqual([]);
  });
});
