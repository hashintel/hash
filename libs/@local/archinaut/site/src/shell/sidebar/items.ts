/**
 * The sidebar tree from the manifest's pages: one pass files every page
 * under its parent slug, and every directory with pages beneath it but no
 * page of its own under *its* parent, as an implied group; the tree is then
 * read off by recursion from the root.
 */

import type {
  ManifestDiff,
  ManifestPage,
} from "../../../../src/bundle/outputs";

export type PageStatus = ManifestDiff["pages"][string];

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

const architectureSlug = "architecture";

const parentOf = (slug: string): string =>
  slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : "";

const labelFromSlug = (slug: string): string =>
  (slug.split("/").pop() ?? slug)
    .split("-")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");

/** How many pages at or beneath `slug` changed, coloured by their one status. */
const groupBadge = (
  slug: string,
  statuses: Record<string, PageStatus>,
): GroupBadge | undefined => {
  const changed = Object.entries(statuses)
    .filter(([page]) => page === slug || page.startsWith(`${slug}/`))
    .map(([, status]) => status);
  const [first] = changed;
  if (first === undefined) {
    return undefined;
  }
  return {
    text: String(changed.length),
    status: changed.every((status) => status === first) ? first : "mixed",
  };
};

interface Tree {
  /** Pages by their parent slug, in the order given. */
  pages: Map<string, ManifestPage[]>;
  /** Directories without a page of their own, by their parent slug. */
  implied: Map<string, string[]>;
}

const treeOf = (pages: ManifestPage[]): Tree => {
  const slugs = new Set(pages.map((page) => page.slug));
  const tree: Tree = { pages: new Map(), implied: new Map() };
  const file = <T>(into: Map<string, T[]>, parent: string, entry: T): void => {
    const entries = into.get(parent);
    if (entries === undefined) {
      into.set(parent, [entry]);
    } else if (!entries.includes(entry)) {
      entries.push(entry);
    }
  };
  for (const page of pages) {
    file(tree.pages, parentOf(page.slug), page);
    for (
      let directory = parentOf(page.slug);
      directory !== "" && !slugs.has(directory);
      directory = parentOf(directory)
    ) {
      file(tree.implied, parentOf(directory), directory);
    }
  }
  return tree;
};

/**
 * The items under `parent`: a page with anything beneath it becomes a group
 * whose first entry, "Overview", is the page itself; a page without is a
 * link; and every implied directory follows as a group named after it.
 */
const itemsUnder = (
  tree: Tree,
  parent: string,
  statuses: Record<string, PageStatus>,
): SidebarItem[] => [
  ...(tree.pages.get(parent) ?? []).map((page): SidebarItem => {
    const link: SidebarItem = {
      kind: "link",
      label: page.title,
      slug: page.slug,
      status: statuses[page.slug],
    };
    return tree.pages.has(page.slug) || tree.implied.has(page.slug)
      ? {
          kind: "group",
          label: page.title,
          slug: page.slug,
          collapsed: true,
          items: [
            { ...link, label: "Overview" },
            ...itemsUnder(tree, page.slug, statuses),
          ],
          badge: groupBadge(page.slug, statuses),
        }
      : link;
  }),
  ...(tree.implied.get(parent) ?? []).map((slug): SidebarItem => ({
    kind: "group",
    label: labelFromSlug(slug),
    slug: null,
    collapsed: true,
    items: itemsUnder(tree, slug, statuses),
    badge: groupBadge(slug, statuses),
  })),
];

/** The sidebar: authored pages first, then the generated architecture tree, open. */
export const buildSidebarItems = (
  pages: ManifestPage[],
  statuses: Record<string, PageStatus>,
): SidebarItem[] => {
  const tree = treeOf(
    pages.toSorted(
      (left, right) =>
        left.order - right.order || left.slug.localeCompare(right.slug),
    ),
  );
  const root = pages.find((page) => page.slug === architectureSlug);
  return [
    ...itemsUnder(tree, "", statuses).filter(
      (item) => item.slug !== architectureSlug,
    ),
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
                status: statuses[root.slug],
              },
              ...itemsUnder(tree, root.slug, statuses),
            ],
            badge: groupBadge(root.slug, statuses),
          },
        ]),
  ];
};

/** Whether `item` holds the page at `slug`, at any depth. */
export const contains = (item: SidebarItem, slug: string): boolean =>
  item.kind === "link"
    ? item.slug === slug
    : item.items.some((child) => contains(child, slug));
