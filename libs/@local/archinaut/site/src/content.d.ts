/**
 * The files `archinaut` writes into `content/` before every dev or build
 * run, declared here so the site type-checks on a checkout without a
 * bundle. With the files present TypeScript reads the JSON itself.
 */

declare module "*/content/manifest.json" {
  const manifest: import("../../src/bundle/outputs").BundleManifest;
  export default manifest;
}

declare module "*/content/site.json" {
  const site: Pick<
    import("../../src/config").SiteConfig,
    "title" | "description" | "url"
  >;
  export default site;
}
