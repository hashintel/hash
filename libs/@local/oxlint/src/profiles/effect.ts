import { strict as effectStrict } from "@effect/tsgo/oxlint-presets";

import type { Profile } from "./profile.js";

export const effect: Profile = {
  extends: [effectStrict],
  definedJsDocTags: [
    "effect-leakable-service",
    "effect-expect-leaking",
    "effect-identifier",
    "effect-diagnostics",
    "effect-diagnostics-next-line",
    "effect-codegens",
  ],
  rules: {
    "new-cap": "allow", // clashes with effect's capitalization conventions
    "oxc/no-barrel-file": "allow", // side-effect free barrel files are common
    "import/no-namespace": "allow", // barrel files are common in effect
    "no-underscore-dangle": ["deny", { allow: ["_tag"] }], // `_tag` is used to discriminate union types
    "unicorn/max-nested-calls": "allow", // functional programming and composition
    "typescript/no-namespace": ["deny", { allowDeclarations: true }], // declarations are often used for type aliases
    "no-shadow": "allow", // covered by the strict typescript setup
    "no-redeclare": "allow", // covered by the strict typescript setup
    "effecttsgo/missed-pipeable-opportunity": "deny", // nested function calls otherwise aren't readable
    "unicorn/no-array-method-this-argument": "allow", // false positives as it only name matches
  },
};
