/**
 * The frontend's `moduleResolution: "node"` ignores package `exports`, so
 * TypeScript cannot find these folio subpaths' own types. Webpack resolves
 * them at runtime.
 */

/** `@stll/folio-react`'s types import this subpath. */
declare module "@stll/folio-core/ai-edits" {
  export * from "@stll/folio-core/dist/ai-edits/index";
}

/** Re-exports `@stll/folio-core`'s English messages. */
declare module "@stll/folio-react/messages/en" {
  export * from "@stll/folio-core/dist/i18n/messages/en.gen";
}
