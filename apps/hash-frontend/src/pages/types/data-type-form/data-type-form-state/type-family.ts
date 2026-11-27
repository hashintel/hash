import { extractBaseUrl } from "@blockprotocol/type-system";

import type {
  BaseUrl,
  DataType,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * The family rank of a group's fellow members among conversion targets: the
 * group is the closest shared parent, so co-members sort above depth-1 ties
 * (every type extending the same primitive root shares it at depth 1) while
 * staying below the viewer's own descendants at 0.
 */
export const coMemberRank = 0.5;

/**
 * A type's ancestors (via extension or group membership) keyed by their
 * distance from it: itself at 0, parents at 1, grandparents at 2, …
 */
export const ancestorDepthMap = ({
  selfBaseUrl,
  parentIds,
  resolveSchema,
}: {
  selfBaseUrl: BaseUrl | null;
  parentIds: VersionedUrl[];
  resolveSchema: (id: VersionedUrl) => DataType | undefined;
}): Map<BaseUrl, number> => {
  const depths = new Map<BaseUrl, number>();
  if (selfBaseUrl) {
    depths.set(selfBaseUrl, 0);
  }
  const queue = parentIds.map((id) => ({ id, depth: 1 }));
  for (let index = 0; index < queue.length; index++) {
    const entry = queue[index];
    if (!entry) {
      continue;
    }
    const baseUrl = extractBaseUrl(entry.id);
    const known = depths.get(baseUrl);
    if (known !== undefined && known <= entry.depth) {
      continue;
    }
    depths.set(baseUrl, entry.depth);
    for (const { $ref } of resolveSchema(entry.id)?.allOf ?? []) {
      queue.push({ id: $ref, depth: entry.depth + 1 });
    }
  }
  return depths;
};

/**
 * How near a family member a type is: the distance (on the depth map's side)
 * to the nearest ancestor the two share. Everything shares the primitive
 * root eventually, so unrelated types tie at the far end.
 */
export const familyDepthFrom = ({
  dataTypeId,
  ancestorDepths,
  resolveSchema,
}: {
  dataTypeId: VersionedUrl;
  ancestorDepths: Map<BaseUrl, number>;
  resolveSchema: (id: VersionedUrl) => DataType | undefined;
}): number => {
  let nearest = Number.POSITIVE_INFINITY;
  const visited = new Set<BaseUrl>();
  const queue = [dataTypeId];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (!id) {
      continue;
    }
    const baseUrl = extractBaseUrl(id);
    if (visited.has(baseUrl)) {
      continue;
    }
    visited.add(baseUrl);
    const depth = ancestorDepths.get(baseUrl);
    if (depth !== undefined && depth < nearest) {
      nearest = depth;
    }
    for (const { $ref } of resolveSchema(id)?.allOf ?? []) {
      queue.push($ref);
    }
  }
  return nearest;
};

/** The abstract ancestors in a depth map — the groups a type belongs to */
export const groupAncestorsOf = ({
  ancestorDepths,
  resolveLatestSchema,
}: {
  ancestorDepths: Map<BaseUrl, number>;
  resolveLatestSchema: (baseUrl: BaseUrl) => DataType | undefined;
}): Set<BaseUrl> => {
  const groups = new Set<BaseUrl>();
  for (const [baseUrl, depth] of ancestorDepths) {
    if (depth > 0 && resolveLatestSchema(baseUrl)?.abstract === true) {
      groups.add(baseUrl);
    }
  }
  return groups;
};

/** Whether a type's ancestry reaches any of the given group base URLs */
export const belongsToAnyGroup = ({
  dataTypeId,
  groupBaseUrls,
  resolveSchema,
}: {
  dataTypeId: VersionedUrl;
  groupBaseUrls: ReadonlySet<BaseUrl>;
  resolveSchema: (id: VersionedUrl) => DataType | undefined;
}): boolean => {
  if (groupBaseUrls.size === 0) {
    return false;
  }
  const visited = new Set<BaseUrl>();
  const queue = [dataTypeId];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (!id) {
      continue;
    }
    const baseUrl = extractBaseUrl(id);
    if (visited.has(baseUrl)) {
      continue;
    }
    visited.add(baseUrl);
    if (groupBaseUrls.has(baseUrl)) {
      return true;
    }
    for (const { $ref } of resolveSchema(id)?.allOf ?? []) {
      queue.push($ref);
    }
  }
  return false;
};
