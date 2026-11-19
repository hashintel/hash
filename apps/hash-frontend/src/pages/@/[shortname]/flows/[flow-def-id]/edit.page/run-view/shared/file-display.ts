import { getFileProperties } from "../../../../../../../shared/get-file-properties";

import type { PropertyObject } from "@blockprotocol/type-system";
import type { IconName } from "@hashintel/ds-components";

const sizeUnits = ["KB", "MB", "GB"];
const sizeFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

/** E.g. "512 bytes", "820 KB" or "1.2 MB", in steps of 1,000 as Finder counts them. */
export const formatFileSize = (bytes: number) => {
  if (bytes < 1000) {
    return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  }

  const exact = Math.floor(Math.log10(bytes) / 3);
  /* E.g. 999,950 bytes rounds to 1,000 KB, so is 1 MB. */
  const step = Math.min(
    bytes / 1000 ** exact >= 999.95 ? exact + 1 : exact,
    sizeUnits.length,
  );

  return `${sizeFormat.format(bytes / 1000 ** step)} ${sizeUnits[step - 1]}`;
};

/** E.g. "PDF": its name's extension, else its MIME type's subtype where that's a plain word. */
const getFileType = ({
  fileName,
  mimeType,
}: {
  fileName?: string;
  mimeType?: string;
}) => {
  const type =
    fileName?.match(/\.([a-z0-9]+)$/i)?.[1] ??
    mimeType?.match(/^[a-z]+\/([a-z0-9]+)$/i)?.[1];

  return type?.toUpperCase() ?? "File";
};

/** A file's type and size, e.g. "PDF · 1.2 MB", and nothing specific to its type, such as a certificate's validity. */
export const getFileMeta = (properties: PropertyObject) => {
  const { fileName, mimeType, fileSize } = getFileProperties(properties);
  const type = getFileType({ fileName, mimeType });

  return fileSize === undefined
    ? type
    : `${type} · ${formatFileSize(fileSize)}`;
};

/** A file's icon: the same for every type until an icon per type is chosen. */
export const getFileIcon = (_properties: PropertyObject): IconName => "file";
