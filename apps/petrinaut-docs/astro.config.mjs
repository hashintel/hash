// @ts-check
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig, fontProviders } from "astro/config";

import { resolveDiffCompareContext } from "./src/diff-context";
import { rehypeInlineDiagrams } from "./src/plugins/inline-diagrams.mjs";

/**
 * Renders the architecture bundle produced by `@local/petrinaut-arch-docs`.
 *
 * This site owns no content. That is the point: the bundle has to render in a
 * host that did not generate it, so anything that only works here is a bug in
 * the bundle's portability, which is why the sidebar below is built from
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
 * @typedef {{ text: string, variant: "success" | "note" | "danger" }} SidebarBadge
 * @typedef {{ label: string, link: string, badge?: SidebarBadge, attrs?: Record<string, string> }} SidebarLink
 * @typedef {{ label: string, collapsed?: boolean, items: SidebarItem[], badge?: SidebarBadge }} SidebarGroup
 * @typedef {SidebarLink | SidebarGroup} SidebarItem
 */

/**
 * Change statuses from a diff build (a preview built against a base ref).
 * Empty on a plain build, so everything below renders as before.
 *
 * @type {Record<string, "added" | "changed" | "removed">}
 */
const diffPages = manifest.diff?.pages ?? {};

const DIFF_BADGES = /** @type {const} */ ({
  added: { text: "new", variant: "success" },
  changed: { text: "changed", variant: "note" },
  removed: { text: "removed", variant: "danger" },
});

/**
 * Badge and class for one page's link.
 *
 * @param {string} slug
 */
const diffLinkProps = (slug) => {
  const status = diffPages[slug];
  return status === undefined
    ? {}
    : {
        badge: DIFF_BADGES[status],
        // A data attribute rather than `class`: Starlight already merges
        // `attrs.class` into the link's computed class and then re-spreads
        // `attrs`, which would emit a second `class` attribute.
        attrs: { "data-pnd-diff": status },
      };
};

/**
 * Roll-up badge for a group: how many pages at or beneath `slug` changed, so
 * a collapsed group still shows that something inside it did. Colored by the
 * one status when they all match, neutral when mixed.
 *
 * @param {string} slug
 */
const diffGroupProps = (slug) => {
  const statuses = Object.entries(diffPages)
    .filter(
      ([pageSlug]) => pageSlug === slug || pageSlug.startsWith(`${slug}/`),
    )
    .map(([, status]) => status);

  if (statuses.length === 0) {
    return {};
  }

  const uniform = statuses.every((status) => status === statuses[0])
    ? statuses[0]
    : null;

  return {
    badge: {
      text: String(statuses.length),
      variant: uniform === null ? "note" : DIFF_BADGES[uniform].variant,
    },
  };
};

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

  /**
   * Title for a directory that holds pages but has no page of its own, matching
   * how the generator titles a page whose frontmatter omits one.
   *
   * @param {string} slug
   * @returns {string}
   */
  const labelFromSlug = (slug) =>
    (slug.split("/").pop() ?? slug)
      .split("-")
      .map((word) =>
        word === "" ? word : word[0].toUpperCase() + word.slice(1),
      )
      .join(" ");

  /**
   * Whether a slug belongs to the generated `architecture/` tree.
   *
   * Compared by path segment, not by prefix. `startsWith("architecture")` also
   * matched a root page called `architecture-decisions`, which then belonged to
   * neither section and appeared in neither.
   *
   * @param {string} slug
   * @returns {boolean}
   */
  const isGenerated = (slug) =>
    slug === "architecture" || slug.startsWith("architecture/");

  /**
   * Builds a nested item list from one set of pages.
   *
   * Taking the page set as an argument runs the same nesting over the generated
   * tree and the authored pages beside it. Authored pages used to be filtered to
   * root level instead, so `content/guides/setup.mdx` produced `guides/setup`,
   * which built and served but appeared nowhere in the sidebar.
   *
   * Recursive, so the return type is annotated explicitly — TypeScript cannot
   * infer it from a function that references itself.
   *
   * @param {typeof pages} within
   * @returns {(parentSlug: string) => SidebarItem[]}
   */
  const itemsFrom = (within) => {
    const hasChildren = new Set(
      within.map((page) => parentOf(page.slug)).filter((slug) => slug !== ""),
    );

    /**
     * @param {string} parentSlug
     * @returns {SidebarItem[]}
     */
    const itemsUnder = (parentSlug) => {
      const prefix = parentSlug === "" ? "" : `${parentSlug}/`;

      const direct = within.filter(
        (page) => parentOf(page.slug) === parentSlug,
      );
      const directSlugs = new Set(direct.map((page) => page.slug));

      /**
       * Directories that hold pages but have no page of their own.
       *
       * `content/guides/setup.mdx` produces `guides/setup` with nothing at
       * `guides`, so without a synthesised group the recursion has no page to
       * descend from and the guide is absent from the sidebar.
       *
       * Kept when the directory has any descendant, not when it is some page's
       * direct parent. `guides/advanced/setup` makes `guides/advanced` a direct
       * parent but leaves `guides` with none, so testing `hasChildren` dropped
       * the whole subtree while a two-segment slug beside it worked.
       *
       * @type {string[]}
       */
      const implied = [
        ...new Set(
          within
            .filter(
              (page) =>
                page.slug !== parentSlug && page.slug.startsWith(prefix),
            )
            .map(
              (page) =>
                `${prefix}${page.slug.slice(prefix.length).split("/")[0]}`,
            )
            .filter((slug) => slug !== parentSlug && !directSlugs.has(slug)),
        ),
      ].filter((slug) =>
        within.some((page) => page.slug.startsWith(`${slug}/`)),
      );

      return [
        ...direct.map((page) => {
          const link = page.slug === "index" ? "/" : `/${page.slug}`;

          return hasChildren.has(page.slug)
            ? {
                label: page.title,
                collapsed: true,
                // Named "Overview" rather than "<title> overview", matching the
                // Architecture group and avoiding a label that repeats the
                // group it sits directly beneath.
                items: [
                  { label: "Overview", link, ...diffLinkProps(page.slug) },
                  ...itemsUnder(page.slug),
                ],
                ...diffGroupProps(page.slug),
              }
            : { label: page.title, link, ...diffLinkProps(page.slug) };
        }),
        ...implied.map((slug) => ({
          label: labelFromSlug(slug),
          collapsed: true,
          items: itemsUnder(slug),
          ...diffGroupProps(slug),
        })),
      ];
    };

    return itemsUnder;
  };

  const architectureRoot = pages.find((page) => page.slug === "architecture");
  const authored = pages.filter((page) => !isGenerated(page.slug));

  return [
    ...itemsFrom(authored)(""),
    ...(architectureRoot
      ? [
          {
            label: "Architecture",
            collapsed: false,
            items: [
              {
                label: "Overview",
                link: `/${architectureRoot.slug}`,
                ...diffLinkProps(architectureRoot.slug),
              },
              ...itemsFrom(pages)(architectureRoot.slug),
            ],
            ...diffGroupProps(architectureRoot.slug),
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

/**
 * Resolved here rather than in the component that renders it: this file
 * already owns reading the manifest, and after bundling a component has no
 * stable relative path to the bundle. Injected as a compile-time constant
 * below (`vite.define`).
 */
const diffCompareContext = await resolveDiffCompareContext(manifest);

export default defineConfig({
  site: "https://docs.petrinaut.org",

  vite: {
    define: {
      __PND_DIFF_COMPARE__: JSON.stringify(diffCompareContext),
    },
  },

  ...(hasAuthoredIndex ? {} : { redirects: { "/": "/architecture" } }),

  // Diagrams arrive as markdown images and are inlined so the page's palette
  // reaches them; see the plugin.
  markdown: { rehypePlugins: [rehypeInlineDiagrams] },

  // The bundle's inter-page links are relative and assume slugs map to URLs
  // without a trailing slash. `format: "file"` writes `views.html` rather than
  // `views/index.html`, so there is no trailing-slash form of a URL for a reader
  // to land on and resolve those links one level too deep. See the generator's
  // README for the contract.
  trailingSlash: "never",
  build: { format: "file" },

  /*
   * One variable file per family covers every weight the site uses, downloaded
   * and subset at build time so a reader makes no request to a font host.
   * Italic is left out of both: no style in the docs uses it.
   *
   * Inter stands in for the grotesque the reference design uses, which is not
   * licensed for redistribution. It is the closest freely available match on
   * the details that carry that look: a tall x-height, flat terminals, and
   * digits that hold their width.
   */
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Inter",
      cssVariable: "--pnd-font-sans",
      weights: ["400 700"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: [
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
      ],
    },
    {
      provider: fontProviders.fontsource(),
      name: "JetBrains Mono",
      cssVariable: "--pnd-font-mono",
      weights: ["400 700"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
    },
  ],

  integrations: [
    // Generated layer pages import the bundle's facts and relations cards, and
    // authored pages may import its diagram components; both are React.
    react(),
    starlight({
      title: "Docs",
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
      // Narrows both side panels and rounds the images, and styles the collapse
      // controls that `components.SiteTitle` renders. See `chrome.css`.
      customCss: ["./src/styles/chrome.css"],
      components: {
        Head: "./src/components/Head.astro",
        SiteTitle: "./src/components/SiteTitle.astro",
      },
      // Restores the collapsed state before first paint. In the component's own
      // script the sidebar would render at full width and then jump.
      head: [
        {
          tag: "script",
          content: `try {
  const stored = localStorage.getItem("pnd:sidebar");
  const width = localStorage.getItem("pnd:sidebar-width");
  if (stored === "collapsed") document.documentElement.dataset.pndSidebar = stored;
  if (width) document.documentElement.style.setProperty("--pnd-sidebar-open-width", width);
} catch {}`,
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
