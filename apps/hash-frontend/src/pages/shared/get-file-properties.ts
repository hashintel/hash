import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import type { PropertyObject } from "@blockprotocol/type-system";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";

const docxMimeType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const getFileProperties = (properties: PropertyObject) => {
  const { description, displayName, fileUrl, fileName, mimeType, fileSize } =
    simplifyProperties(properties as FileProperties);

  const isImage = mimeType?.startsWith("image/") ?? null;

  const isPdf = mimeType === "application/pdf" || !!fileName?.endsWith(".pdf");

  const isDocx =
    mimeType === docxMimeType || !!fileName?.toLowerCase().endsWith(".docx");

  return {
    description,
    displayName,
    fileName,
    fileSize,
    fileUrl,
    isDocx,
    isImage,
    isPdf,
    mimeType,
  };
};

export const getImageUrlFromEntityProperties = (properties: PropertyObject) => {
  const { isImage, fileUrl } = getFileProperties(properties);

  return isImage ? fileUrl : undefined;
};
