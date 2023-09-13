import {
  EntityPropertiesObject,
  fileUrlPropertyTypeUrl,
  mimeTypePropertyTypeUrl,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

export const getImageUrlFromFileProperties = (
  properties: EntityPropertiesObject,
) => {
  const mimeType = properties[extractBaseUrl(mimeTypePropertyTypeUrl)] as
    | string
    | undefined;

  return mimeType?.startsWith("image/")
    ? (properties[extractBaseUrl(fileUrlPropertyTypeUrl)] as string | undefined)
    : undefined;
};
