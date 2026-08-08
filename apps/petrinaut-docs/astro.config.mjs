// @ts-check
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

/**
 * Renders the architecture bundle produced by `@local/petrinaut-arch-docs`.
 *
 * This site owns no content. That is the point: the bundle has to render in a
 * host that did not generate it, and this site is the first of two such hosts
 * (hash.dev being the other). Anything that only works here is a bug in the
 * bundle's portability, which is why the sidebar below is built from
 * `manifest.json` rather than from Starlight-specific frontmatter.
 */

const manifestPath = fileURLToPath(
  new URL(
    "../../libs/@local/petrinaut-arch-docs/bundle/manifest.json",
    import.meta.url,
  ),
);

/** @type {import("@local/petrinaut-arch-docs").BundleManifest} */
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

/**
 * @typedef {{ label: string, link: string }} SidebarLink
 * @typedef {{ label: string, collapsed?: boolean, items: SidebarItem[] }} SidebarGroup
 * @typedef {SidebarLink | SidebarGroup} SidebarItem
 */

/**
 * Builds Starlight's nested sidebar from the manifest.
 *
 * Nesting follows the *slug*, not whether a page was generated. An authored
 * guide that attached itself to a layer has a slug beneath that layer, so it
 * nests with the generated reference for the same code — which is the whole
 * point of attaching it. Ordering within a level uses the manifest's `order`,
 * so guides (low numbers) sort ahead of sub-layers (1000+).
 */
const buildSidebar = () => {
  const pages = [...manifest.pages].sort(
    (left, right) =>
      left.order - right.order || left.slug.localeCompare(right.slug),
  );

  /**
   * @param {string} slug
   * @returns {string}
   */
  const parentOf = (slug) =>
    slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : "";

  const hasChildren = new Set(
    pages.map((page) => parentOf(page.slug)).filter((slug) => slug !== ""),
  );

  /**
   * Recursive, so the return type is annotated explicitly — TypeScript cannot
   * infer it from a function that references itself.
   *
   * @param {string} parentSlug
   * @returns {SidebarItem[]}
   */
  const itemsUnder = (parentSlug) =>
    pages
      .filter((page) => parentOf(page.slug) === parentSlug)
      .map((page) =>
        hasChildren.has(page.slug)
          ? {
              label: page.title,
              collapsed: true,
              items: [
                { label: `${page.title} overview`, link: `/${page.slug}` },
                ...itemsUnder(page.slug),
              ],
            }
          : { label: page.title, link: `/${page.slug}` },
      );

  const architectureRoot = pages.find((page) => page.slug === "architecture");
  const narrative = pages.filter(
    (page) => !page.slug.startsWith("architecture") && !page.slug.includes("/"),
  );

  return [
    ...narrative.map((page) => ({
      label: page.title,
      link: page.slug === "index" ? "/" : `/${page.slug}`,
    })),
    ...(architectureRoot
      ? [
          {
            label: "Architecture",
            collapsed: false,
            items: [
              { label: "Overview", link: `/${architectureRoot.slug}` },
              ...itemsUnder(architectureRoot.slug),
            ],
          },
        ]
      : []),
  ];
};

/**
 * Authored pages are optional, so the site must have a root page without them.
 *
 * An authored `index` page becomes `/`. With no authored content at all, `/`
 * redirects to the generated overview instead, which keeps `content/` a genuine
 * opt-in rather than something the site quietly depends on.
 */
const hasAuthoredIndex = manifest.pages.some(
  (page) => page.kind === "authored" && page.slug === "index",
);

export default defineConfig({
  site: "https://petrinaut-docs.hash.dev",

  ...(hasAuthoredIndex ? {} : { redirects: { "/": "/architecture" } }),

  // The bundle's inter-page links are relative and assume slugs map to URLs
  // without a trailing slash. `format: "file"` writes `views.html` rather than
  // `views/index.html`, so there is no trailing-slash form of a URL for a reader
  // to land on and resolve those links one level too deep. See the generator's
  // README for the contract.
  trailingSlash: "never",
  build: { format: "file" },

  integrations: [
    // Authored pages may import diagram components from the bundle; generated
    // pages stay plain Markdown and never need this.
    react(),
    starlight({
      title: "Architecture Docs",
      description:
        "How the Petrinaut packages fit together — generated from annotations in the source.",
      // The helmet carries the Petrinaut identity, so the title beside it names
      // only what this site is. `replacesTitle: false` keeps both.
      logo: {
        src: "./src/assets/petrinaut-helmet.png",
        alt: "Petrinaut",
        replacesTitle: false,
      },
      favicon: "/favicon.ico",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/hashintel/hash/tree/main/libs/@hashintel/petrinaut",
        },
      ],
      sidebar: buildSidebar(),
      // No llms.txt plugin: the bundle emits its own `architecture.md` and
      // `architecture.json`, which `scripts/sync-bundle.mjs` copies into
      // `public/`. Serving those keeps the site's machine-readable surface
      // identical to what any other host of the bundle would serve, rather than
      // a second, site-shaped copy that could disagree with it.
      pagination: false,
    }),
  ],
});
