import {
  extractBaseUrl,
  extractVersion,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { useMemo } from "react";

import { EntityTypesByVersionedUrl } from "../../shared/entity-types-options-context";
import { PropertyTypesByVersionedUrl } from "../../shared/property-types-options-context";
import { typedValues } from "./typed-values";

export const useTypeVersions = (
  typeId: VersionedUrl,
  typeOptions?: PropertyTypesByVersionedUrl | EntityTypesByVersionedUrl,
) => {
  return useMemo(() => {
    const baseUrl = extractBaseUrl(typeId);

    const versions = typedValues(typeOptions ?? {}).filter(
      (type) => baseUrl === extractBaseUrl(type.$id),
    );

    const latestVersion = Math.max(
      ...versions.map((version) => extractVersion(version.$id)),
    );

    return [extractVersion(typeId), latestVersion, baseUrl] as const;
  }, [typeId, typeOptions]);
};
