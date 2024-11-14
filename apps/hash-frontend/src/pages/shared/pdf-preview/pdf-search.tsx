import { TextField } from "@hashintel/design-system";
import { Box, Collapse, outlinedInputClasses } from "@mui/material";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import { useEffect, useState } from "react";

type PositionInPage = {
  rowIndex: number;
  characterIndex: number;
};

export type SearchHit = {
  start: PositionInPage;
  end: PositionInPage;
};

export type SelectedSearchHit = {
  searchHit: SearchHit;
  pageNumber: number;
};

export type SearchHitsByPageNumber = {
  [pageNumber: number]: SearchHit[];
};

type Page = {
  concatenatedText: string;
  textLines: TextItem[];
  itemCharacterStartIndices: number[];
  number: number;
};

const findOccurrencesAcrossTextItems = (
  pages: Page[],
  searchString: string,
): SearchHitsByPageNumber => {
  const results: SearchHitsByPageNumber = {};

  // Iterate over each page
  for (const {
    concatenatedText,
    textLines,
    itemCharacterStartIndices,
    number,
  } of pages) {
    // Search for the search string in the combined text
    let matchStartIndex = concatenatedText.indexOf(searchString);

    while (matchStartIndex !== -1) {
      const matchEndIndex = matchStartIndex + searchString.length - 1;

      // Determine which line the match starts on, and at which character within the line
      const startItemIndex = itemCharacterStartIndices.findIndex(
        (startIdx, idx) =>
          startIdx <= matchStartIndex &&
          (idx === textLines.length - 1 ||
            itemCharacterStartIndices[idx + 1]! > matchStartIndex),
      );
      const startCharIndex =
        matchStartIndex - itemCharacterStartIndices[startItemIndex]!;

      // Determine which line the match ends on, and at which character within the line
      const endItemIndex = itemCharacterStartIndices.findIndex(
        (startIdx, idx) =>
          startIdx <= matchEndIndex &&
          (idx === textLines.length - 1 ||
            itemCharacterStartIndices[idx + 1]! > matchEndIndex),
      );
      const endCharIndex =
        matchEndIndex - itemCharacterStartIndices[endItemIndex]!;

      results[number] ??= [];
      results[number].push({
        start: { rowIndex: startItemIndex, characterIndex: startCharIndex },
        end: { rowIndex: endItemIndex, characterIndex: endCharIndex },
      });

      // Continue searching for the next occurrence
      matchStartIndex = concatenatedText.indexOf(
        searchString,
        matchStartIndex + 1,
      );
    }
  }

  return results;
};

type PdfSearchProps = {
  closeSearch: () => void;
  document: PDFDocumentProxy | null;
  searchHits: SearchHitsByPageNumber;
  setSearchHits: (hits: SearchHitsByPageNumber) => void;
  selectedSearchHit: SelectedSearchHit | null;
  setSelectedSearchHit: (hit: SelectedSearchHit | null) => void;
  showSearch: boolean;
};

export const PdfSearch = ({
  closeSearch,
  document,
  searchHits,
  setSearchHits,
  selectedSearchHit,
  setSelectedSearchHit,
  showSearch,
}: PdfSearchProps) => {
  const [searchText, setSearchText] = useState("");

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
            concatenatedText += `${item.str} `;
            textLines.push(item);
          }
        }

        newPages.push({
          concatenatedText,
          textLines,
          itemCharacterStartIndices,
          number: pageNumber,
        });
      }

      setPages(newPages);
    };

    void getPages();
  }, [document]);

  return (
    <Collapse orientation="horizontal" in={showSearch}>
      <Box>
        <TextField
          autoFocus
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search the document..."
          sx={{
            width: 200,
            [`.${outlinedInputClasses.root} input`]: {
              fontSize: 13,
              py: 0.8,
              px: 1.5,
            },
          }}
          value={searchText}
        />
      </Box>
    </Collapse>
  );
};
