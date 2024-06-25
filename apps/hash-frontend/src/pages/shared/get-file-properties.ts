import type { PropertyObject } from "@local/hash-graph-types/entity";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";

export const getFileProperties = (properties: PropertyObject) => {
  const { description, displayName, fileUrl, fileName, mimeType, fileSize } =
    simplifyProperties(properties as FileProperties);

  const isImage = mimeType?.startsWith("image/") ?? null;

  return {
    description,
    displayName,
    fileName,
    fileSize,
    fileUrl,
    isImage,
    mimeType,
  };
};

export const getImageUrlFromEntityProperties = (properties: PropertyObject) => {
  const { isImage, fileUrl } = getFileProperties(properties);

  return isImage ? fileUrl : undefined;
};
