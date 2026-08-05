/**
 * Programmatic entry point for consumers of the architecture bundle.
 *
 * The Starlight site imports `readBundle` rather than reaching into the bundle's
 * file layout, so the layout stays an implementation detail of this package.
 */

export { buildBundle, bundleTextFiles, GENERATOR_NAME } from "./build";
export type { BuiltBundle } from "./build";
export { collectAuthoredContent } from "./content";
export type { AuthoredPage } from "./content";
export {
  BUNDLE_MANIFEST_VERSION,
  type BundleManifest,
  type ManifestPage,
} from "./emit/bundle-outputs";
export type { GeneratedPage } from "./emit/mdx";
export type { Diagnostic } from "./extract";
export {
  ARCHITECTURE_MODEL_VERSION,
  architectureModelSchema,
  type ArchitectureModel,
  type ArchitecturePackage,
  type Boundary,
  type BoundaryKind,
  type Edge,
  type Layer,
} from "./model";
export { readBundle } from "./read-bundle";
export { scanTags, type ParsedTags } from "./tags";
