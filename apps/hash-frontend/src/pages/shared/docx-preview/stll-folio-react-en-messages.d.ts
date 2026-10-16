/**
 * The frontend's `moduleResolution: "node"` ignores package `exports`, so
 * TypeScript cannot find this subpath's own types. Webpack resolves it at
 * runtime. The subpath re-exports `@stll/folio-core`'s English messages.
 */
declare module "@stll/folio-react/messages/en" {
  export * from "@stll/folio-core/dist/i18n/messages/en.gen";
}
