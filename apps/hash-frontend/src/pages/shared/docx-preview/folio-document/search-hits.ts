import type { DocxEditorRef, FindResult } from "@stll/folio-react";

type FolioFind = Pick<
  DocxEditorRef,
  "clearFind" | "find" | "findNext" | "findPrevious" | "getFindResult"
>;

export type DocxSearchResult = {
  hitCount: number;
  currentHitIndex: number | null;
};

export const toSearchResult = (
  result: FindResult | null,
): DocxSearchResult => ({
  hitCount: result?.totalCount ?? 0,
  currentHitIndex: result && result.totalCount > 0 ? result.currentIndex : null,
});

export const searchDocument = (
  editor: FolioFind,
  text: string,
  ignoreCase: boolean,
) => {
  if (text) {
    editor.find(text, { matchCase: !ignoreCase });
  } else {
    editor.clearFind();
  }
};

/**
 * Makes hit `index` the current hit and scrolls to it. folio moves the
 * current hit one hit at a time.
 */
export const showSearchHit = (editor: FolioFind, index: number) => {
  const currentHitIndex = editor.getFindResult()?.currentIndex;
  if (currentHitIndex === undefined) {
    return;
  }

  for (let i = currentHitIndex; i < index; i++) {
    editor.findNext();
  }
  for (let i = currentHitIndex; i > index; i--) {
    editor.findPrevious();
  }
};
