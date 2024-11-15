import { faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  ArrowDownRegularIcon,
  ArrowUpRegularIcon,
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/design-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import {
  Box,
  Collapse,
  outlinedInputClasses,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import debounce from "lodash/debounce";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { useEffect, useRef, useState } from "react";

import { FontCaseRegularIcon } from "../../../shared/icons/font-case-regular-icon";
import { GrayToBlueIconButton } from "../gray-to-blue-icon-button";

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

type PdfSearchProps = {
  closeSearch: () => void;
  document: PDFDocumentProxy | null;
  searchHits: SearchHits;
  setSearchHits: (hits: SearchHits) => void;
  selectedSearchHit: SearchHit | null;
  setSelectedSearchHit: (hit: SearchHit | null) => void;
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
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [searchText, setSearchText] = useState("");

  const [pages, setPages] = useState<Page[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

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

  const getSearchHits = debounce(
    (currentText: string, shouldIgnoreCase: boolean) => {
      if (!currentText) {
        setSearchHits({ hitsByPageNumber: {}, total: 0 });
        setSelectedSearchHit(null);
        return;
      }

      const hits = findStringInPages({
        pages,
        searchString: currentText,
        ignoreCase: shouldIgnoreCase,
      });
      setSearchHits(hits);

      const firstPageWithHit = typedKeys(hits.hitsByPageNumber)[0];
      const firstHit = firstPageWithHit
        ? hits.hitsByPageNumber[firstPageWithHit]?.[0]
        : null;

      setSelectedSearchHit(firstHit ?? null);
    },
    300,
  );

  const { total, hitsByPageNumber } = searchHits;

  useEffect(() => {
    if (showSearch) {
      inputRef.current?.focus();
    }
  }, [showSearch]);

  const allHits = Object.values(hitsByPageNumber).flat();

  return (
    <Collapse orientation="horizontal" in={showSearch}>
      <Box>
        <TextField
          autoFocus
          inputRef={inputRef}
          InputProps={{
            endAdornment: (
              <Tooltip title="Clear Search">
                <IconButton
                  onClick={() => {
                    setSearchText("");
                    setSelectedSearchHit(null);
                    setSearchHits({ hitsByPageNumber: {}, total: 0 });
                    closeSearch();
                  }}
                  sx={{ mr: 0.5 }}
                  size="small"
                  unpadded
                >
                  <FontAwesomeIcon icon={faXmark} />
                </IconButton>
              </Tooltip>
            ),
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (
                selectedSearchHit &&
                selectedSearchHit.indexInAllHits < total - 1
              ) {
                setSelectedSearchHit(
                  allHits[selectedSearchHit.indexInAllHits + 1]!,
                );
              }
            }
          }}
          onChange={(event) => {
            const text = event.target.value;
            setSearchText(text);
            getSearchHits(text, ignoreCase);
          }}
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
        <Stack direction="row" gap={2} mt={0.8} justifyContent="flex-end">
          <Collapse
            orientation="horizontal"
            in={!!selectedSearchHit && total > 0}
            timeout={200}
          >
            <Stack
              direction="row"
              alignItems="center"
              gap={1}
              sx={{ height: 22 }}
            >
              <GrayToBlueIconButton
                disabled={
                  !selectedSearchHit || selectedSearchHit.indexInAllHits === 0
                }
                onClick={() => {
                  if (
                    selectedSearchHit &&
                    selectedSearchHit.indexInAllHits > 0
                  ) {
                    setSelectedSearchHit(
                      allHits[selectedSearchHit.indexInAllHits - 1]!,
                    );
                  }
                }}
                sx={{ "& svg": { fontSize: 10 }, p: 0.6 }}
              >
                <ArrowUpRegularIcon />
              </GrayToBlueIconButton>
              <Typography
                component="span"
                sx={{
                  fontSize: 12,
                  color: ({ palette }) => palette.gray[90],
                  whiteSpace: "nowrap",
                }}
              >
                {`${(selectedSearchHit?.indexInAllHits ?? -1) + 1} of ${total}`}
              </Typography>
              <GrayToBlueIconButton
                disabled={
                  !selectedSearchHit ||
                  selectedSearchHit.indexInAllHits === total - 1
                }
                onClick={() => {
                  if (
                    selectedSearchHit &&
                    selectedSearchHit.indexInAllHits < total - 1
                  ) {
                    setSelectedSearchHit(
                      allHits[selectedSearchHit.indexInAllHits + 1]!,
                    );
                  }
                }}
                sx={{ "& svg": { fontSize: 10 }, p: 0.6 }}
              >
                <ArrowDownRegularIcon />
              </GrayToBlueIconButton>
            </Stack>
          </Collapse>
          <GrayToBlueIconButton
            onClick={() => {
              getSearchHits(searchText, !ignoreCase);
              setIgnoreCase(!ignoreCase);
              inputRef.current?.focus();
            }}
            sx={{ "& svg": { fontSize: 13 }, p: 0.5 }}
          >
            <FontCaseRegularIcon
              sx={{
                fill: ({ palette }) =>
                  ignoreCase ? undefined : palette.blue[70],
                transition: ({ transitions }) => transitions.create("fill"),
              }}
            />
          </GrayToBlueIconButton>
        </Stack>
      </Box>
    </Collapse>
  );
};
