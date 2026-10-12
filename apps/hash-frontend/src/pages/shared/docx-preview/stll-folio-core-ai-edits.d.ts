/**
 * `@stll/folio-react`'s types import this subpath, which the frontend's
 * `moduleResolution: "node"` cannot find because it ignores package `exports`.
 */
declare module "@stll/folio-core/ai-edits" {
  export * from "@stll/folio-core/dist/ai-edits/index";
}
