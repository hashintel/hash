import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection, z } from "astro:content";

/**
 * The docs collection is populated by `scripts/sync-bundle.mjs`, which copies the
 * generated bundle into `src/content/docs`. This app authors no content of its
 * own — see the sync script for why copying rather than loading in place.
 */
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    // The bundle emits a generic `sidebar_order`; it is accepted here and turned
    // into sidebar structure in astro.config.mjs, so the bundle never has to
    // carry Starlight-shaped frontmatter.
    schema: docsSchema({
      extend: z.object({
        sidebar_order: z.number().optional(),
      }),
    }),
  }),
};
