import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

/**
 * The docs collection is populated by `scripts/sync-bundle.mjs`, which copies the
 * generated bundle into `src/content/docs`. This app authors no content of its
 * own — see the sync script for why copying rather than loading in place.
 *
 * The bundle's `sidebar_order` frontmatter is read from `manifest.json` by
 * `astro.config.mjs`, not from here, so the schema is Starlight's own.
 */
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
};
