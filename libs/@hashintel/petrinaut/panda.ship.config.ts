import {
  createNodeSpecifierResolver,
  createPetrinautPandaConfig,
  resolveDsComponentsBuildInfoPath,
} from "./panda.config.shared";

const config = createPetrinautPandaConfig(
  resolveDsComponentsBuildInfoPath(
    /** Panda evaluates this config through CJS, so `__filename` is available here. */
    createNodeSpecifierResolver(__filename),
  ),
);

/**
 * Config for `panda ship`, which emits `dist/panda.buildinfo.json` — the
 * static-analysis results for Petrinaut's own style usage. Hosts (e.g. the
 * HASH frontend) add this file to their Panda `include` so Petrinaut's
 * utilities are generated inside the host's single cascade-layer graph,
 * instead of relying on two independently polyfilled bundles whose synthetic
 * specificity boosts can differ (see FE-1228).
 *
 * Differences from the main config's `include`:
 *
 * - No ds-components build info: hosts embedding Petrinaut already include
 *   `@hashintel/ds-components/panda.buildinfo.json` directly.
 * - No Storybook files or stories/tests: story-only styles are not part of
 *   the package's runtime surface and would bloat host stylesheets.
 */
export default {
  ...config,
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: [
    "./src/**/*.stories.{ts,tsx}",
    "./src/**/*.test.{ts,tsx}",
    "./src/**/*.spec.{ts,tsx}",
  ],
};
