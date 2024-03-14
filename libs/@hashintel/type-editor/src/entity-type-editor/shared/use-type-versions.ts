import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system/slim";
import { useMemo } from "react";

import type { EntityTypesByVersionedUrl } from "../../shared/entity-types-options-context";
import type { PropertyTypesByVersionedUrl } from "../../shared/property-types-options-context";
import { typedValues } from "./typed-values";

export const useTypeVersions = (
  typeId: VersionedUrl,
  typeOptions?: PropertyTypesByVersionedUrl | EntityTypesByVersionedUrl,
) => {
  return useMemo(() => {
    const baseUrl = extractBaseUrl(typeId);

    const versions = typedValues(typeOptions ?? {}).filter(
      (type) => baseUrl === extractBaseUrl(type.schema.$id),
    );

    const latestVersion = Math.max(
      ...versions.map((version) => extractVersion(version.schema.$id)),
    );

    return [extractVersion(typeId), latestVersion, baseUrl] as const;
  }, [typeId, typeOptions]);
};
