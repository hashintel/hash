import {
  EntityPropertiesObject,
  fileUrlPropertyTypeUrl,
  mimeTypePropertyTypeUrl,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

export const getImageUrlFromEntityProperties = (
  properties: EntityPropertiesObject,
) => {
  const mimeType = properties[extractBaseUrl(mimeTypePropertyTypeUrl)] as
    | string
    | undefined;

  return mimeType?.startsWith("image/")
    ? (properties[extractBaseUrl(fileUrlPropertyTypeUrl)] as string | undefined)
    : undefined;
};

export const getFileUrlFromFileProperties = (
  properties: EntityPropertiesObject,
) => {
  const url = properties[extractBaseUrl(fileUrlPropertyTypeUrl)] as
    | string
    | undefined;

  const mimeType = properties[extractBaseUrl(mimeTypePropertyTypeUrl)] as
    | string
    | undefined;

  const isImage = mimeType?.startsWith("image/") ?? null;

  return {
    isImage,
    url,
  };
};
