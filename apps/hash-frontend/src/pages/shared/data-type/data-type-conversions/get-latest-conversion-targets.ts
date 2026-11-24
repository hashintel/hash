import {
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  extractBaseUrl,
} from "@blockprotocol/type-system";

import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

type ConversionTarget = {
  targetDataTypeId: VersionedUrl;
  title: string;
  valueForOneOfThese: number;
};

export const getLatestConversionTargets = (
  sourceId: VersionedUrl,
  targets: ConversionTarget[],
): ConversionTarget[] => {
  const sourceBaseUrl = extractBaseUrl(sourceId);
  const latest = new Map<BaseUrl, ConversionTarget>();
  for (const target of targets) {
    const { baseUrl, version } = componentsFromVersionedUrl(
      target.targetDataTypeId,
    );
    if (baseUrl === sourceBaseUrl) {
      continue;
    }
    const previous = latest.get(baseUrl);
    if (
      !previous ||
      compareOntologyTypeVersions(
        version,
        componentsFromVersionedUrl(previous.targetDataTypeId).version,
      ) > 0
    ) {
      latest.set(baseUrl, target);
    }
  }
  return [...latest.values()].sort(
    (left, right) => left.valueForOneOfThese - right.valueForOneOfThese,
  );
};
