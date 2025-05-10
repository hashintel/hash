import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  atLeastOne,
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system";
import { useMemo } from "react";

import type { EntityTypesByVersionedUrl } from "../../shared/entity-types-options-context";
import type { PropertyTypesByVersionedUrl } from "../../shared/property-types-options-context";
import { typedValues } from "./typed-values";

export const useTypeVersions = (
  typeId: VersionedUrl,
  typeOptions?: PropertyTypesByVersionedUrl | EntityTypesByVersionedUrl,
) => {
  return useMemo(() => {
    const { baseUrl, version } = componentsFromVersionedUrl(typeId);

    const versions = atLeastOne(
      typedValues(typeOptions ?? {})
        .filter((type) => baseUrl === extractBaseUrl(type.schema.$id))
        .map((options) => extractVersion(options.schema.$id)),
    );

    const latestVersion =
      versions === undefined
        ? version
        : versions.reduce(
            (max, current) =>
              compareOntologyTypeVersions(current, max) > 0 ? current : max,
            versions[0],
          );

    return [version, latestVersion, baseUrl] as const;
  }, [typeId, typeOptions]);
};
