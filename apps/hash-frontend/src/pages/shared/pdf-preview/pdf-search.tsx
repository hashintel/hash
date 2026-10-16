import { useEffect, useState } from "react";

import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { DocumentCallback } from "react-pdf/dist/cjs/shared/types";

type PositionInPage = {
  rowIndex: number;
  characterIndex: number;
};

export type SearchHit = {
  start: PositionInPage;
  end: PositionInPage;
  pageNumber: number;
  indexInAllHits: number;
};

export type SearchHitsByPageNumber = {
  [pageNumber: number]: SearchHit[];
};

export type SearchHits = {
  hitsByPageNumber: SearchHitsByPageNumber;
  total: number;
};

type Page = {
  /**
   * The result of combining the text from each line, i.e. the full text for the page
   */
  concatenatedText: string;
  /**
   * The text content of the page, broken down by line
   */
  textLines: TextItem[];
  /**
   * The character index at which each line starts in the concatenated text
   */
  lineCharacterStartIndices: number[];
  /**
   * The number of the page in the document (starting at 1)
   */
  pageNumber: number;
};

/**
 * Find all the occurrences of a string in a collection of pages.
 *
 * Potential improvements:
 * 1. Identify occurrences that span multiple pages
 */
const findStringInPages = ({
  pages,
  searchString: unnormalizedSearchString,
  ignoreCase,
}: {
  pages: Page[];
  searchString: string;
  ignoreCase: boolean;
}): SearchHits => {
  const results: SearchHits = {
    hitsByPageNumber: {},
    total: 0,
  };

  const searchString = ignoreCase
    ? unnormalizedSearchString.toLowerCase()
    : unnormalizedSearchString;

  for (const {
    concatenatedText: unnormalizedText,
    textLines,
    lineCharacterStartIndices,
    pageNumber,
  } of pages) {
    const fullPageText = ignoreCase
      ? unnormalizedText.toLowerCase()
      : unnormalizedText;

    /** Find the first occurrence of the search string in the full text for the page */
    let nextStartIndex = fullPageText.indexOf(searchString);

    while (nextStartIndex !== -1) {
      results.total += 1;

      const matchEndIndex = nextStartIndex + searchString.length - 1;
      const matchStartIndex = nextStartIndex;

      /** Determine which line the match starts on, and at which character within the line */
      const startItemIndex = lineCharacterStartIndices.findIndex(
        (startIdx, idx) =>
          startIdx <= matchStartIndex &&
          (idx === textLines.length - 1 ||
            lineCharacterStartIndices[idx + 1]! > matchStartIndex),
      );
      const startCharIndex =
        matchStartIndex - lineCharacterStartIndices[startItemIndex]!;

      /** Determine which line the match ends on, and at which character within the line */
      const endItemIndex = lineCharacterStartIndices.findIndex(
        (startIdx, idx) =>
          startIdx <= matchEndIndex &&
          (idx === textLines.length - 1 ||
            lineCharacterStartIndices[idx + 1]! > matchEndIndex),
      );
      const endCharIndex =
        matchEndIndex - lineCharacterStartIndices[endItemIndex]!;

      results.hitsByPageNumber[pageNumber] ??= [];
      results.hitsByPageNumber[pageNumber].push({
        start: { rowIndex: startItemIndex, characterIndex: startCharIndex },
        end: { rowIndex: endItemIndex, characterIndex: endCharIndex },
        pageNumber,
        indexInAllHits: results.total - 1,
      });

      /** Find the next occurrence */
      nextStartIndex = fullPageText.indexOf(searchString, nextStartIndex + 1);
    }
  }

  return results;
};

/**
 * Returns a function that finds the occurrences of a string in the document.
 */
export const useFindSearchHits = (document: DocumentCallback | null) => {
  const [pages, setPages] = useState<Page[]>([]);

  /**
   * Build the information we need to identify search hits within the document.
   */
  useEffect(() => {
    if (!document) {
      return;
    }

    const newPages: Page[] = [];

    const getPages = async () => {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();

        const textLines: TextItem[] = [];

        let concatenatedText = "";
        const itemCharacterStartIndices: number[] = [];

        for (const item of textContent.items) {
          if ("str" in item) {
            itemCharacterStartIndices.push(concatenatedText.length);

            /**
             * This assumes that the text on one line and the text on the next should be separated by a space.
             * This may not be the case if one line ends with an em/en dash or other potentially 'joining' characters,
             * but we can't be sure that such characters are intended to imply joining either.
             */
            concatenatedText += `${item.str.trim()} `;
            textLines.push(item);
          }
        }

        newPages.push({
          concatenatedText,
          textLines,
          lineCharacterStartIndices: itemCharacterStartIndices,
          pageNumber,
        });
      }

      setPages(newPages);
    };

    void getPages();
  }, [document]);

  return (searchString: string, ignoreCase: boolean) =>
    findStringInPages({ pages, searchString, ignoreCase });
};
