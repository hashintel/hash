import type { OxlintConfig } from "oxlint";

const configurations = function* (
  config: OxlintConfig,
  ancestors: Set<OxlintConfig>,
): Generator<OxlintConfig> {
  if (ancestors.has(config)) {
    throw new Error("Circular Oxlint configuration inheritance.");
  }

  ancestors.add(config);
  for (const extension of config.extends ?? []) {
    yield* configurations(extension, ancestors);
  }

  ancestors.delete(config);
  yield config;
};

export const inheritConfig = (config: OxlintConfig): OxlintConfig => {
  const env: NonNullable<OxlintConfig["env"]> = {};
  const globals: NonNullable<OxlintConfig["globals"]> = {};
  const settings: NonNullable<OxlintConfig["settings"]> = {};
  const ignorePatterns: string[] = [];

  // Oxlint does not inherit these fields. Keep its handling of rules, plugins and overrides, including rule-name normalization.
  for (const inherited of configurations(config, new Set())) {
    Object.assign(env, inherited.env);
    Object.assign(globals, inherited.globals);
    Object.assign(settings, inherited.settings);
    ignorePatterns.push(...(inherited.ignorePatterns ?? []));
  }

  return { ...config, env, globals, settings, ignorePatterns };
};
