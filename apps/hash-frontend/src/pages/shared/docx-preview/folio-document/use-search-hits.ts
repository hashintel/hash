import { hashFolioAIBlockText } from "@stll/folio-react";
import escapeRegExp from "lodash/escapeRegExp";
import { useRef } from "react";

import type { DocxEditorRef, FolioAIEditSnapshot } from "@stll/folio-react";
import type { RefObject } from "react";

type SearchHit = Parameters<DocxEditorRef["showInDocument"]>[0];

type SnapshotBlock = Pick<
  FolioAIEditSnapshot["blocks"][number],
  "id" | "kind" | "text"
>;

/** Finds every occurrence of `text` in the document's text blocks. */
export const findSearchHits = (
  blocks: readonly SnapshotBlock[],
  text: string,
  ignoreCase: boolean,
): SearchHit[] => {
  const pattern = new RegExp(escapeRegExp(text), ignoreCase ? "gi" : "g");

  return blocks
    .filter((block) => block.kind !== "diagnostic")
    .flatMap((block) =>
      [...block.text.matchAll(pattern)].map((match): SearchHit => {
        const startOffset = match.index;
        const endOffset = startOffset + match[0].length;
        return {
          type: "textRange",
          story: "main",
          blockId: block.id,
          startOffset,
          endOffset,
          selectedTextHash: hashFolioAIBlockText(
            block.text.slice(startOffset, endOffset),
          ),
        };
      }),
    );
};

/**
 * Searches the document folio shows and selects a hit in it. `search`
 * returns how many hits there are, and `showHit` scrolls to one of them.
 */
export const useSearchHits = (editorRef: RefObject<DocxEditorRef | null>) => {
  const searchResult = useRef<{
    hits: SearchHit[];
    snapshot: FolioAIEditSnapshot | null;
  }>({ hits: [], snapshot: null });

  /** Collapses the selection `showHit` made, so no earlier hit stays marked. */
  const clearShownHit = () => {
    const pagedEditor = editorRef.current?.getEditorRef();
    const selection = pagedEditor?.getState()?.selection;
    if (pagedEditor && selection && !selection.empty) {
      pagedEditor.setSelection(selection.head);
    }
  };

  const search = (text: string, ignoreCase: boolean) => {
    const editor = editorRef.current;
    if (!editor || !text) {
      searchResult.current = { hits: [], snapshot: null };
      clearShownHit();
      return 0;
    }

    /** folio creates its editor view lazily and has no snapshot before it. */
    editor.ensureEditorView({ focus: false });
    const snapshot = editor.createAIEditSnapshot();
    const hits = findSearchHits(snapshot?.blocks ?? [], text, ignoreCase);

    searchResult.current = { hits, snapshot };
    if (hits.length === 0) {
      clearShownHit();
    }
    return hits.length;
  };

  const showHit = (index: number) => {
    const { hits, snapshot } = searchResult.current;
    const hit = hits[index];
    if (hit) {
      editorRef.current?.showInDocument(hit, snapshot ?? undefined);
    }
  };

  return { search, showHit };
};
