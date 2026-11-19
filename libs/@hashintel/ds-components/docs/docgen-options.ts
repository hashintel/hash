import type { ParserOptions } from "react-docgen-typescript";

/**
 * react-docgen-typescript options shared by the Storybook build
 * (`.storybook/main.ts`) and the published docgen registry
 * (`scripts/generate-docgen-registry.ts`), so `PropsTable` renders the same
 * prop tables in Storybook and in the published docs pages.
 */
export const docgenParserOptions: ParserOptions = {
  // react-docgen-typescript names every component in a file after the first
  // top-level `X.displayName = "…"` string literal it finds, then dedupes
  // docs by name — collapsing multi-component files (Banner, Icon, Popover…)
  // to a single prop table. Name docs by export symbol instead; runtime
  // displayName assignments are unaffected.
  componentNameResolver: (exp) => exp.getName(),
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
  // Keep prop tables on the public API: drop inherited DOM/aria props (the
  // node_modules check the default filter would otherwise apply) plus
  // styling/plumbing props, mostly mirroring preview.tsx's controls.exclude.
  // `never`-typed props (e.g. Button's anchor/button variant exclusions)
  // extract as type "undefined" and would render as junk rows.
  propFilter: (prop) =>
    (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true) &&
    prop.type.name !== "undefined" &&
    prop.type.name !== "never" &&
    !/^(className|contentClassName|positionerClassName|style|ref|inputRef|testId|htmlForId|data-.+)$/.test(
      prop.name,
    ),
};
