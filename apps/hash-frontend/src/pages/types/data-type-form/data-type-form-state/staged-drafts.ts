import type { ConversionOperator } from "../conversion-util";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { ConstructDataTypeParams } from "@local/hash-graph-sdk/ontology";

/**
 * A fully-specified new data type held in memory rather than the graph: the
 * drawer that collected it never persisted anything, so discarding the parent
 * drawer discards the draft. Its versioned URL is the one creation will
 * claim, letting it stand in `allOf`-entry lists before it exists.
 */
export type StagedDataTypeDraft = {
  baseUrl: BaseUrl;
  versionedUrl: VersionedUrl;
  dataType: ConstructDataTypeParams;
  /**
   * A staged group's members (existing types) — republished to extend the
   * group once it is created
   */
  memberDataTypeIds?: VersionedUrl[];
  /**
   * A staged group's members that are themselves drafts — created extending
   * the group once it exists, recursively, so groups nest to any depth
   */
  memberDrafts?: StagedDataTypeDraft[];
  /**
   * Conversions authored for the draft, placed by the planner when the type
   * is created: each reads "draft = target `operator` `value`"
   */
  conversionRows?: Array<{
    targetBaseUrl: BaseUrl;
    operator: ConversionOperator;
    value: number;
  }>;
  /**
   * A staged group's conversion edits for its EXISTING members, one entry
   * per touched member holding that member's full desired set (empty =
   * cleared) — planned and written when the group is created
   */
  memberConversionRows?: Array<{
    childBaseUrl: BaseUrl;
    rows: Array<{
      targetBaseUrl: BaseUrl;
      operator: ConversionOperator;
      value: number;
    }>;
  }>;
};

/**
 * Every versioned URL a draft forest claims, at any nesting depth. The
 * subtree rooted at `excludeUrl` is skipped: a re-opened draft re-claims its
 * own tree's URLs itself, with its own editing exclusions.
 */
export const collectDraftUrls = (
  drafts: StagedDataTypeDraft[],
  excludeUrl: VersionedUrl | null,
): VersionedUrl[] => {
  const urls: VersionedUrl[] = [];
  const walk = (draft: StagedDataTypeDraft) => {
    if (draft.versionedUrl === excludeUrl) {
      return;
    }
    urls.push(draft.versionedUrl);
    for (const nested of draft.memberDrafts ?? []) {
      walk(nested);
    }
  };
  for (const draft of drafts) {
    walk(draft);
  }
  return urls;
};

/**
 * Creation order for a set of (folded) drafts: a conversion entry
 * references its target, which the store requires to exist — so a draft
 * converting to a sibling draft is created after it. Targets anywhere in a
 * sibling's nested-member tree pull in that whole sibling, and references
 * authored anywhere in this draft's own tree count as its references. A
 * (user-authored) cycle falls back to the given order and surfaces as a
 * creation error.
 */
export const orderDraftsByConversionDependencies = (
  drafts: StagedDataTypeDraft[],
): StagedDataTypeDraft[] => {
  // Every base URL in a draft's tree resolves to the given (root) draft —
  // creating the root creates its nested members with it
  const rootByBase = new Map<BaseUrl, StagedDataTypeDraft>();
  const indexTree = (root: StagedDataTypeDraft, draft: StagedDataTypeDraft) => {
    rootByBase.set(draft.baseUrl, root);
    for (const nested of draft.memberDrafts ?? []) {
      indexTree(root, nested);
    }
  };
  for (const draft of drafts) {
    indexTree(draft, draft);
  }

  /** Every conversion target referenced anywhere in a draft's tree */
  const treeTargets = (draft: StagedDataTypeDraft): BaseUrl[] => [
    ...(draft.conversionRows ?? []).map((row) => row.targetBaseUrl),
    ...(draft.memberConversionRows ?? []).flatMap((entry) =>
      entry.rows.map((row) => row.targetBaseUrl),
    ),
    ...(draft.memberDrafts ?? []).flatMap(treeTargets),
  ];

  const ordered: StagedDataTypeDraft[] = [];
  const visiting = new Set<BaseUrl>();
  const done = new Set<BaseUrl>();

  const visit = (draft: StagedDataTypeDraft) => {
    if (done.has(draft.baseUrl) || visiting.has(draft.baseUrl)) {
      return;
    }
    visiting.add(draft.baseUrl);
    for (const targetBaseUrl of treeTargets(draft)) {
      const dependency = rootByBase.get(targetBaseUrl);
      if (dependency && dependency !== draft) {
        visit(dependency);
      }
    }
    visiting.delete(draft.baseUrl);
    done.add(draft.baseUrl);
    ordered.push(draft);
  };

  for (const draft of drafts) {
    visit(draft);
  }
  return ordered;
};
