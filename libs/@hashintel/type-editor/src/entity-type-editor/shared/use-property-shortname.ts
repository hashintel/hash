import { extractBaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";
import { useMemo } from "react";

export const usePropertyShortname = (typeId: VersionedUrl) => {
  return useMemo(() => {
    const baseUrl = extractBaseUrl(typeId);

    return baseUrl.match("/@(.*?)/types/property-type/")?.[1]!;
  }, [typeId]);
};
