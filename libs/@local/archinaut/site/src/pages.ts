/**
 * The pages, from the bundle's manifest: what each one is, how they nest in
 * the sidebar, and how a page's compiled module is loaded on demand.
 */

import manifestJson from "./content/manifest.json";

import type { BundleManifest, ManifestPage } from "../../src/bundle/outputs";
import type { ComponentType } from "react";

export const manifest = manifestJson as BundleManifest;

export type PageStatus = "added" | "changed" | "removed";

export interface TocEntry {
  depth: number;
  slug: string;
  text: string;
}

/** A page's compiled module, as the MDX pipeline exports it. */
export interface PageModule {
  default: ComponentType<{ components?: Record<string, ComponentType> }>;
  toc?: TocEntry[];
}

export interface LoadedPage {
  page: ManifestPage;
  Content: PageModule["default"];
  toc: TocEntry[];
}

const modules = import.meta.glob<PageModule>("./content/docs/**/*.mdx");

export const pagesBySlug = new Map(
  manifest.pages.map((page) => [page.slug, page]),
);

export const diffStatuses: Record<string, PageStatus> =
  manifest.diff?.pages ?? {};

/** The URL path a slug is served at. */
export const hrefOf = (slug: string): string =>
  slug === "index" ? "/" : `/${slug}`;

/** The slug a URL path names; `/` is the index page. */
export const slugOf = (pathname: string): string => {
  const trimmed = pathname.replace(/^\/+|\/+$/gu, "");
  return trimmed === "" ? "index" : decodeURIComponent(trimmed);
};

export const loadPage = async (slug: string): Promise<LoadedPage | null> => {
  const page = pagesBySlug.get(slug);
  if (page === undefined) {
    return null;
  }
  const load = modules[`./content/docs/${page.path.slice("pages/".length)}`];
  if (load === undefined) {
    return null;
  }
  const module = await load();
  return { page, Content: module.default, toc: module.toc ?? [] };
};

export interface GroupBadge {
  text: string;
  status: PageStatus | "mixed";
}

export type SidebarItem =
  | { kind: "link"; label: string; slug: string; status?: PageStatus }
  | {
      kind: "group";
      label: string;
      slug: string | null;
      collapsed: boolean;
      items: SidebarItem[];
      badge?: GroupBadge;
    };

const parentOf = (slug: string): string =>
  slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : "";

const labelFromSlug = (slug: string): string =>
  (slug.split("/").pop() ?? slug)
    .split("-")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");

const isGenerated = (slug: string): boolean =>
  slug === "architecture" || slug.startsWith("architecture/");

/** How many pages at or beneath `slug` changed, coloured by their one status. */
const groupBadge = (slug: string): GroupBadge | undefined => {
  const statuses = Object.entries(diffStatuses)
    .filter(([page]) => page === slug || page.startsWith(`${slug}/`))
    .map(([, status]) => status);
  const [first] = statuses;
  if (first === undefined) {
    return undefined;
  }
  return {
    text: String(statuses.length),
    status: statuses.every((status) => status === first) ? first : "mixed",
  };
};

/**
 * Nests one set of pages by slug: a page with pages beneath it becomes a
 * group whose first entry, "Overview", is the page itself, and a directory
 * with pages but no page of its own becomes a group named after it.
 */
const itemsFrom =
  (within: ManifestPage[]) =>
  (parentSlug: string): SidebarItem[] => {
    const prefix = parentSlug === "" ? "" : `${parentSlug}/`;
    const hasChildren = new Set(within.map((page) => parentOf(page.slug)));
    const direct = within.filter((page) => parentOf(page.slug) === parentSlug);
    const directSlugs = new Set(direct.map((page) => page.slug));
    const implied = [
      ...new Set(
        within
          .filter(
            (page) => page.slug !== parentSlug && page.slug.startsWith(prefix),
          )
          .map(
            (page) =>
              `${prefix}${page.slug.slice(prefix.length).split("/")[0]}`,
          )
          .filter((slug) => slug !== parentSlug && !directSlugs.has(slug)),
      ),
    ].filter((slug) => within.some((page) => page.slug.startsWith(`${slug}/`)));
    const items = itemsFrom(within);
    return [
      ...direct.map((page): SidebarItem => {
        const link: SidebarItem = {
          kind: "link",
          label: page.title,
          slug: page.slug,
          status: diffStatuses[page.slug],
        };
        return hasChildren.has(page.slug)
          ? {
              kind: "group",
              label: page.title,
              slug: page.slug,
              collapsed: true,
              items: [{ ...link, label: "Overview" }, ...items(page.slug)],
              badge: groupBadge(page.slug),
            }
          : link;
      }),
      ...implied.map((slug): SidebarItem => ({
        kind: "group",
        label: labelFromSlug(slug),
        slug: null,
        collapsed: true,
        items: items(slug),
        badge: groupBadge(slug),
      })),
    ];
  };

/** The sidebar: authored pages first, then the generated architecture tree. */
export const sidebarItems = (): SidebarItem[] => {
  const pages = [...manifest.pages].sort(
    (left, right) =>
      left.order - right.order || left.slug.localeCompare(right.slug),
  );
  const root = pages.find((page) => page.slug === "architecture");
  const authored = pages.filter((page) => !isGenerated(page.slug));
  return [
    ...itemsFrom(authored)(""),
    ...(root === undefined
      ? []
      : [
          {
            kind: "group" as const,
            label: "Architecture",
            slug: root.slug,
            collapsed: false,
            items: [
              {
                kind: "link" as const,
                label: "Overview",
                slug: root.slug,
                status: diffStatuses[root.slug],
              },
              ...itemsFrom(pages)(root.slug),
            ],
            badge: groupBadge(root.slug),
          },
        ]),
  ];
};

/** Whether `item` holds the page at `slug`, at any depth. */
export const contains = (item: SidebarItem, slug: string): boolean =>
  item.kind === "link"
    ? item.slug === slug
    : item.items.some((child) => contains(child, slug));
