import { getFileProperties } from "../../../../../../../../shared/get-file-properties";

import type { PropertyObject } from "@blockprotocol/type-system";
import type { KeyboardEvent } from "react";

/** As on the file's entity page: by its MIME type, else a PDF or Word document by its name's extension. */
export const getFilePreviewKind = (properties: PropertyObject) => {
  const { isImage, isPdf, isDocx } = getFileProperties(properties);

  return isImage ? "image" : isPdf ? "pdf" : isDocx ? "docx" : "other";
};

/** Where a file is among a list's files, and the files either side of it, by their positions in the list. */
export type FileSteps = {
  /** Counting from 1. */
  position: number | null;
  count: number;
  previous: number | null;
  next: number | null;
};

/**
 * A list can hold other entities between its files, which ← → pass over. The file is nowhere while the list's entities
 * are loading.
 */
export const getFileSteps = (
  /** For each entity in the list, whether it's a file. */
  files: boolean[],
  index: number,
): FileSteps => {
  const fileIndexes = files.flatMap((isFile, listIndex) =>
    isFile ? [listIndex] : [],
  );
  const at = fileIndexes.indexOf(index);

  if (at === -1) {
    return {
      position: null,
      count: fileIndexes.length,
      previous: null,
      next: null,
    };
  }

  return {
    position: at + 1,
    count: fileIndexes.length,
    previous: fileIndexes[at - 1] ?? null,
    next: fileIndexes[at + 1] ?? null,
  };
};

/** ← and → step through a list's files. */
export const goByFileKey = (
  event: KeyboardEvent,
  steps: FileSteps,
  onGo: (index: number) => void,
) => {
  const index =
    event.key === "ArrowLeft"
      ? steps.previous
      : event.key === "ArrowRight"
        ? steps.next
        : undefined;

  if (index === undefined) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (index !== null) {
    onGo(index);
  }
};
