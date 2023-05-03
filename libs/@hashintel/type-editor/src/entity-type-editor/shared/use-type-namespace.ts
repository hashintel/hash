import { extractBaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";
import { useMemo } from "react";

export const useTypeNamespace = (typeId: VersionedUrl) => {
  return useMemo(() => {
    const baseUrl = extractBaseUrl(typeId);

    const matches = baseUrl.match(
      "/@(.*?)/types/property-type/|/@(.*?)/types/entity-type/",
    );

    return (matches?.[1] || matches?.[2])!;
  }, [typeId]);
};
