// @ts-check
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";

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

/** Generated pages start at this order; see the generator's README. */
const generatedOrderBase = 1000;

/**
 * Turns the manifest's flat, slug-ordered page list into Starlight's nested
 * sidebar shape. Slugs already encode the hierarchy (`architecture/core/hir`),
 * so a group is created for any page that has descendants.
 */
const buildSidebar = () => {
  const pages = [...manifest.pages].sort(
    (left, right) =>
      left.order - right.order || left.slug.localeCompare(right.slug),
  );

  const authored = pages.filter((page) => page.order < generatedOrderBase);
  const generated = pages.filter((page) => page.order >= generatedOrderBase);

  const hasChildren = new Set(
    generated.flatMap((page) => {
      const parent = page.slug.slice(0, page.slug.lastIndexOf("/"));
      return parent === "" ? [] : [parent];
    }),
  );

  /** @param {string} parentSlug */
  const itemsUnder = (parentSlug) =>
    generated
      .filter((page) => {
        const parent = page.slug.slice(0, page.slug.lastIndexOf("/"));
        return parent === parentSlug;
      })
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

  const root = generated.find((page) => page.slug === "architecture");

  // Authored pages nest by slug directory too, so a set of deep-dives under
  // `simulation/` becomes one collapsible group rather than a flat run of links
  // ahead of the generated section.
  const authoredTop = authored.filter((page) => !page.slug.includes("/"));
  const authoredGroups = new Map();
  for (const page of authored) {
    if (!page.slug.includes("/")) {
      continue;
    }
    const group = page.slug.slice(0, page.slug.indexOf("/"));
    authoredGroups.set(group, [...(authoredGroups.get(group) ?? []), page]);
  }

  /** @param {string} slug */
  const groupLabel = (slug) =>
    slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  return [
    ...authoredTop.map((page) => ({
      label: page.title,
      link: page.slug === "index" ? "/" : `/${page.slug}`,
    })),
    ...[...authoredGroups.entries()].map(([group, pages]) => ({
      label: groupLabel(group),
      collapsed: false,
      items: pages.map((page) => ({
        label: page.title,
        link: `/${page.slug}`,
      })),
    })),
    ...(root
      ? [
          {
            label: "Architecture (generated)",
            collapsed: false,
            items: [
              { label: "Overview", link: `/${root.slug}` },
              ...itemsUnder(root.slug),
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
      // Serves /llms.txt and /llms-full.txt so an agent can read the whole site
      // in one request instead of crawling it.
      plugins: [starlightLlmsTxt()],
      pagination: false,
    }),
  ],
});
