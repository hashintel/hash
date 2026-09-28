/** A filing category: a stable address with a display title and filing hint. */
export interface LedgerCategory {
  readonly path: string;
  readonly title: string;
  readonly description: string;
}

/** The categories available to one conversation's Ledger. */
export interface LedgerProfile {
  readonly id: string;
  readonly title: string;
  readonly categories: readonly LedgerCategory[];
}

const coreLeadingCategories: readonly LedgerCategory[] = [
  {
    path: "purpose",
    title: "Purpose and posture",
    description:
      "What the model must support, for whom, its boundary, horizon, and non-claims.",
  },
];

const coreTrailingCategories: readonly LedgerCategory[] = [
  {
    path: "open-matters",
    title: "Cross-cutting open matters",
    description:
      "Consequential unresolved issues that affect several Notes, what they prevent and conditions for returning.",
  },
  {
    path: "delivery",
    title: "Delivery status",
    description:
      "What the account currently supports, consequential gaps, and checks actually performed.",
  },
];

const pathSegment = /^[a-z][a-z0-9-]*$/u;

/**
 * Surround a plugin's categories with core's. Paths are stable keys: each
 * segment is lowercase kebab-case, paths are unique, and a nested path follows
 * its parent.
 */
export const composeLedgerProfile = (plugin: LedgerProfile): LedgerProfile => {
  const categories = [
    ...coreLeadingCategories,
    ...plugin.categories,
    ...coreTrailingCategories,
  ];
  const seen = new Set<string>();
  for (const { path } of categories) {
    const segments = path.split("/");
    if (!segments.every((segment) => pathSegment.test(segment)))
      throw new Error(`Ledger category path ${path} is not kebab-case.`);
    if (seen.has(path))
      throw new Error(`Ledger category path ${path} is duplicated.`);
    const parent = segments.slice(0, -1).join("/");
    if (parent !== "" && !seen.has(parent))
      throw new Error(`Ledger category ${path} precedes its parent ${parent}.`);
    seen.add(path);
  }
  return { id: plugin.id, title: plugin.title, categories };
};
