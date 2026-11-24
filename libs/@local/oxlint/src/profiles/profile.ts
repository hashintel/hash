import type { DummyRuleMap, OxlintConfig } from "oxlint";

/** Configuration that the base profile or a framework profile adds to the shared defaults. */
export interface Profile {
  readonly plugins?: NonNullable<OxlintConfig["plugins"]>;
  readonly extends?: NonNullable<OxlintConfig["extends"]>;
  readonly ignorePatterns?: readonly string[];
  readonly rules?: DummyRuleMap;
  readonly overrides?: NonNullable<OxlintConfig["overrides"]>;

  /** JSDoc tags the framework defines, which `jsdoc/check-tag-names` accepts. */
  readonly definedJsDocTags?: readonly string[];
}
