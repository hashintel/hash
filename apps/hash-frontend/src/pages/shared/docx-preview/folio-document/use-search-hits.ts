import { resolveFolioAITextRange } from "@stll/folio-core/ai-edits";
import { hashFolioAIBlockText } from "@stll/folio-react";
import escapeRegExp from "lodash/escapeRegExp";
import { useEffect, useEffectEvent, useRef } from "react";

import {
  clearSearchHits,
  createHitRange,
  scrollHitIntoView,
  showSearchHits,
} from "../../file-preview-search-highlights";

import type {
  DocPositionRange,
  FolioAITextRangeHandle,
} from "@stll/folio-core/ai-edits";
import type { DocxEditorRef, FolioAIEditSnapshot } from "@stll/folio-react";
import type { RefObject } from "react";

type SnapshotBlock = Pick<
  FolioAIEditSnapshot["blocks"][number],
  "id" | "kind" | "text"
>;

/** Finds every occurrence of `text` in the document's text blocks. */
export const findSearchHits = (
  blocks: readonly SnapshotBlock[],
  text: string,
  ignoreCase: boolean,
): FolioAITextRangeHandle[] => {
  const pattern = new RegExp(escapeRegExp(text), ignoreCase ? "gi" : "g");

  return blocks
    .filter((block) => block.kind !== "diagnostic")
    .flatMap((block) =>
      [...block.text.matchAll(pattern)].map((match): FolioAITextRangeHandle => {
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
 * Returns a `Range` for each of `hits` over the text runs folio has painted,
 * or `null` for a hit that did not resolve or has no painted run. folio
 * paints only the pages near the viewport of a long document.
 */
export const createPaintedHitRanges = (
  container: Element,
  hits: readonly (DocPositionRange | null)[],
): (Range | null)[] => {
  const runs = Array.from(
    container.querySelectorAll<HTMLElement>(
      ".layout-page-content span[data-pm-start][data-pm-end]",
    ),
    (element) => ({
      element,
      from: Number(element.dataset.pmStart),
      to: Number(element.dataset.pmEnd),
    }),
  );

  return hits.map((hit) => {
    if (!hit) {
      return null;
    }
    const isInHit = (run: (typeof runs)[number]) =>
      run.from < hit.to && run.to > hit.from;
    const firstRun = runs.find(isInHit);
    const lastRun = runs.findLast(isInHit);
    if (!firstRun || !lastRun) {
      return null;
    }
    return createHitRange(
      { element: firstRun.element, offset: hit.from - firstRun.from },
      { element: lastRun.element, offset: hit.to - lastRun.from },
    );
  });
};

/**
 * Searches the document folio shows and marks the hits in it. `search`
 * returns how many hits there are, and `showHit` makes one of them the
 * current hit and scrolls to it.
 */
export const useSearchHits = (
  editorRef: RefObject<DocxEditorRef | null>,
  containerRef: RefObject<HTMLElement | null>,
) => {
  const searchResult = useRef<{
    hits: (DocPositionRange | null)[];
    currentHitIndex: number | null;
  }>({ hits: [], currentHitIndex: null });

  /** Set when the current hit's page was not painted when it was shown. */
  const isScrollToCurrentHitPending = useRef(false);

  /** Marks every painted hit and returns the current hit's range. */
  const markHits = () => {
    const container = containerRef.current;
    const { hits, currentHitIndex } = searchResult.current;
    if (!container || hits.length === 0) {
      clearSearchHits();
      return null;
    }

    const hitRanges = createPaintedHitRanges(container, hits);
    const currentHitRange =
      currentHitIndex === null ? null : (hitRanges[currentHitIndex] ?? null);

    showSearchHits(
      hitRanges.filter((range) => range !== null),
      currentHitRange,
    );

    return currentHitRange;
  };

  const scrollToHit = (hitRange: Range) => {
    const scrollContainer = containerRef.current?.querySelector(
      "[data-folio-scroll]",
    );
    if (scrollContainer) {
      scrollHitIntoView(hitRange, scrollContainer);
    }
  };

  /**
   * folio paints a page as it nears the viewport and empties it as it moves
   * away, which empties the ranges on that page. It announces both with
   * `painter:painted`, which bubbles up from its pages.
   */
  const onPainted = useEffectEvent(() => {
    if (searchResult.current.hits.length === 0) {
      return;
    }

    const currentHitRange = markHits();

    if (currentHitRange && isScrollToCurrentHitPending.current) {
      isScrollToCurrentHitPending.current = false;
      scrollToHit(currentHitRange);
    }
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handlePainted = () => onPainted();
    container.addEventListener("painter:painted", handlePainted);

    return () => {
      container.removeEventListener("painter:painted", handlePainted);
      clearSearchHits();
    };
  }, [containerRef]);

  const search = (text: string, ignoreCase: boolean) => {
    const editor = editorRef.current;
    isScrollToCurrentHitPending.current = false;

    if (!editor || !text) {
      searchResult.current = { hits: [], currentHitIndex: null };
      clearSearchHits();
      return 0;
    }

    /** folio creates its editor view lazily and has no snapshot before it. */
    editor.ensureEditorView({ focus: false });
    const snapshot = editor.createAIEditSnapshot();
    const doc = editor.getEditorRef()?.getView()?.state.doc;

    const hits = findSearchHits(snapshot?.blocks ?? [], text, ignoreCase).map(
      (hit) =>
        doc ? resolveFolioAITextRange({ range: hit, doc, snapshot }) : null,
    );

    searchResult.current = { hits, currentHitIndex: null };
    markHits();
    return hits.length;
  };

  const showHit = (index: number) => {
    const hit = searchResult.current.hits[index];
    searchResult.current.currentHitIndex = index;

    const currentHitRange = markHits();

    if (currentHitRange) {
      isScrollToCurrentHitPending.current = false;
      scrollToHit(currentHitRange);
    } else if (hit) {
      isScrollToCurrentHitPending.current = true;
      editorRef.current?.getEditorRef()?.scrollToPosition(hit.from);
    }
  };

  return { search, showHit };
};
