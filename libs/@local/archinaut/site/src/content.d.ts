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
  > & {
    /** Absolute path of the instance's decks, or null. */
    slides: string | null;
  };
  export default site;
}

/** The decks the `archinaut-decks` plugin lists from the slides directory. */
declare module "virtual:archinaut-decks" {
  const decks: import("./slides/decks").DeckSummary[];
  export default decks;
}
