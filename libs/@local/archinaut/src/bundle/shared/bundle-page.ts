/** A page as the bundle ships it, generated or authored. */
export interface BundlePage {
  /** Path within the bundle, e.g. `pages/architecture/core.mdx`. */
  path: string;
  /** Route-ish identifier a host can map onto its own URL space. */
  slug: string;
  title: string;
  description: string;
  contents: string;
  order: number;
  /** `generated` pages are rewritten on every build; `authored` are hand-written. */
  kind: "generated" | "authored";
}

/** Both page lists as one, each page tagged with its kind. */
export const bundlePages = (pages: {
  generated: Omit<BundlePage, "kind">[];
  authored: Omit<BundlePage, "kind">[];
}): BundlePage[] => [
  ...pages.generated.map((page) => ({ ...page, kind: "generated" as const })),
  ...pages.authored.map((page) => ({ ...page, kind: "authored" as const })),
];
