import { URL, fileURLToPath } from "node:url";

import { inheritConfig } from "./lib/inherit-config.js";
import { base } from "./profiles/base.js";
import { effect } from "./profiles/effect.js";
import { next } from "./profiles/next.js";
import { react } from "./profiles/react.js";
import { vitest } from "./profiles/vitest.js";
import plugin from "./rules/index.js";

import type { AdditionalRestrictedTypes } from "./profiles/base.js";
import type { Profile } from "./profiles/profile.js";
import type { DummyRuleMap, OxlintConfig } from "oxlint";

export type Framework = "react" | "next" | "vitest" | "effect";
export type Runtime = "node" | "browser";

/** Native Oxlint configuration with shared runtime and framework profiles. */
export interface Options extends OxlintConfig {
  readonly runtime: Runtime;

  /** Adds restrictions without replacing built-in entries. Duplicate keys throw. */
  readonly additionalRestrictedTypes?: AdditionalRestrictedTypes;

  /** Adds JSDoc tags to the standard ones and those the frameworks define. */
  readonly additionalDefinedJsDocTags?: readonly string[];
  readonly frameworks?: readonly Framework[];
}

type Env = NonNullable<OxlintConfig["env"]>;

const frameworkProfiles = (frameworks: readonly Framework[]): Profile[] => {
  const profiles: Readonly<Record<Framework, Profile>> = {
    react,
    next,
    vitest: vitest({ effect: frameworks.includes("effect") }),
    effect,
  };

  return frameworks.map((framework) => profiles[framework]);
};

/**
 * Combines the base profile with the framework profiles, in the order `frameworks` lists them.
 *
 * Plugins, extensions, ignore patterns and overrides concatenate in that order. Rules merge by name, so a later profile's rule replaces an earlier one's, and the result denies every rule of this package's plugin.
 */
const createDefaults = ({
  runtime,
  frameworks,
  additionalRestrictedTypes,
  additionalDefinedJsDocTags,
}: Required<
  Pick<
    Options,
    | "runtime"
    | "frameworks"
    | "additionalRestrictedTypes"
    | "additionalDefinedJsDocTags"
  >
>): OxlintConfig => {
  const selected = frameworkProfiles(frameworks);
  const profiles = [
    base({
      additionalRestrictedTypes,
      definedJsDocTags: [
        ...additionalDefinedJsDocTags,
        ...selected.flatMap((profile) => profile.definedJsDocTags ?? []),
      ],
    }),
    ...selected,
  ];

  const env: Env = { builtin: true, es2026: true };

  switch (runtime) {
    case "node": {
      env["node"] = true;
      break;
    }
    case "browser": {
      env["browser"] = true;
      break;
    }
  }

  const rules: DummyRuleMap = {};
  for (const profile of profiles) {
    Object.assign(rules, profile.rules);
  }

  const pluginDeny: DummyRuleMap = Object.fromEntries(
    Object.keys(plugin.rules).map((key) => [
      `${plugin.meta?.name ?? "hash"}/${key}`,
      "deny",
    ]),
  );

  return {
    categories: {
      correctness: "deny",
      nursery: "deny",
      pedantic: "deny",
      perf: "deny",
      restriction: "deny",
      style: "deny",
      suspicious: "deny",
    },
    env,
    extends: profiles.flatMap((profile) => profile.extends ?? []),
    ignorePatterns: profiles.flatMap((profile) => profile.ignorePatterns ?? []),
    jsPlugins: [
      {
        name: "hash",
        specifier: fileURLToPath(new URL("rules/index.js", import.meta.url)),
      },
    ],
    options: {
      reportUnusedDisableDirectives: "error",
      typeAware: true,
    },
    overrides: profiles.flatMap((profile) => profile.overrides ?? []),
    plugins: profiles.flatMap((profile) => profile.plugins ?? []),
    rules: { ...rules, ...pluginDeny },
  };
};

/**
 * Combines shared profiles, extensions and package-specific configuration.
 *
 * Environments and globals merge by name. Settings replace each plugin’s value. Ignore patterns concatenate in inheritance order. Other fields retain Oxlint’s merge semantics. Nested values remain shared with the input configs.
 *
 * @throws {Error} If extensions contain a cycle or additional restrictions replace a built-in restricted type.
 */
export const defineConfig = ({
  runtime,
  frameworks = [],
  additionalRestrictedTypes = {},
  additionalDefinedJsDocTags = [],
  ...config
}: Options): OxlintConfig =>
  inheritConfig({
    ...config,
    extends: [
      createDefaults({
        runtime,
        frameworks,
        additionalRestrictedTypes,
        additionalDefinedJsDocTags,
      }),
      ...(config.extends ?? []),
    ],
  });
