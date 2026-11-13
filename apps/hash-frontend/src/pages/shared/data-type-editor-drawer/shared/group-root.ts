import { extractBaseUrl } from "@blockprotocol/type-system";

import { listDataTypeBaseUrl } from "./list-config";

import type {
  BaseUrl,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * The ref a group's synthesized parent points at: the lowest ancestor every
 * member shares. Strict — never a member itself, nor the group's own base URL
 * (members name the group in their `allOf`, so its ancestry shows up through
 * theirs) — keeping the group's inheritance acyclic. Ancestors resolve to
 * their latest versions; `null` when the members' chains never meet or can't
 * be resolved.
 */
export const lowestCommonAncestorRef = ({
  memberDataTypeIds,
  excludeBaseUrl,
  resolveDataType,
  latestDataTypes,
}: {
  memberDataTypeIds: VersionedUrl[];
  /** The group's own base URL */
  excludeBaseUrl?: BaseUrl;
  resolveDataType: (
    dataTypeId: VersionedUrl,
  ) => DataTypeWithMetadata | undefined;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
}): VersionedUrl | null => {
  const memberBaseUrls = new Set(
    memberDataTypeIds.map((memberId) => extractBaseUrl(memberId)),
  );

  const ancestorsPerMember = memberDataTypeIds.map((memberId) => {
    const ancestors = new Map<BaseUrl, { depth: number; ref: VersionedUrl }>();
    const queue: [VersionedUrl, number][] = [[memberId, 0]];
    const visited = new Set<BaseUrl>([extractBaseUrl(memberId)]);

    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        break;
      }
      const [currentId, depth] = next;
      for (const { $ref } of resolveDataType(currentId)?.schema.allOf ?? []) {
        const baseUrl = extractBaseUrl($ref);
        if (visited.has(baseUrl)) {
          continue;
        }
        visited.add(baseUrl);
        ancestors.set(baseUrl, {
          depth: depth + 1,
          ref: latestDataTypes[baseUrl]?.schema.$id ?? $ref,
        });
        queue.push([$ref, depth + 1]);
      }
    }
    return ancestors;
  });

  const [firstChain, ...otherChains] = ancestorsPerMember;
  if (!firstChain) {
    return null;
  }

  let lowest: { ref: VersionedUrl; distance: number } | null = null;
  for (const [baseUrl, { depth, ref }] of firstChain) {
    if (
      memberBaseUrls.has(baseUrl) ||
      baseUrl === excludeBaseUrl ||
      baseUrl === listDataTypeBaseUrl
    ) {
      continue;
    }

    let distance = depth;
    const shared = otherChains.every((chain) => {
      const entry = chain.get(baseUrl);
      if (!entry) {
        return false;
      }
      distance = Math.max(distance, entry.depth);
      return true;
    });

    if (shared && (lowest === null || distance < lowest.distance)) {
      lowest = { ref, distance };
    }
  }

  return lowest?.ref ?? null;
};
