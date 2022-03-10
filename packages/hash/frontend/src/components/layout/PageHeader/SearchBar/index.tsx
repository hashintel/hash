import { useQuery } from "@apollo/client";
import { PageSearchResult } from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { escapeRegExp } from "lodash";
import React, {
  useCallback,
  useEffect,
  useState,
  VoidFunctionComponent,
} from "react";
import { useDebounce, useKey, useOutsideClickRef } from "rooks";
import {
  Box,
  Theme,
  useTheme,
  useMediaQuery,
  SxProps,
  IconButton,
} from "@mui/material";

import { blockDomId } from "../../../../blocks/page/BlockView";
import {
  SearchPagesQuery,
  SearchPagesQueryVariables,
} from "../../../../graphql/apiTypes.gen";
import { searchPages } from "../../../../graphql/queries/search.queries";
import { useUser } from "../../../hooks/useUser";
import { HASH_OPENSEARCH_ENABLED } from "../../../../lib/public-env";
import { SearchInput } from "./SearchInput";
import { Link } from "../../../Link";
import { SearchIcon } from "../../../icons";
import { Button } from "../../../Button";

/** finds the query's words in the result and chops it into parts at the words' boundaries */
const splitByMatches = (result: string, query: string) => {
  const separator = query
    .split(/\s+/g)
    .sort((a, b) => b.length - a.length) // match longer words first
    .map(escapeRegExp)
    .join("|");

  /** @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split#splitting_with_a_regexp_to_include_parts_of_the_separator_in_the_result */
  return result.split(new RegExp(`(${separator})`, "gi"));
};

const toBlockUrl = (searchPage: PageSearchResult): string => {
  const segments = [
    "/",
    searchPage.page.accountId,
    "/",
    searchPage.page.entityId,
  ];

  if (searchPage.block) {
    segments.push("#", blockDomId(searchPage.block.entityId));
  }

  return segments.join("");
};

const ResultList: React.FC<{
  isMobile: boolean;
}> = ({ isMobile, ...props }) => (
  <Box
    component="ul"
    sx={(theme) => ({
      position: !isMobile ? "absolute" : "unset",
      top: !isMobile ? "calc(100% + 1px)" : "unset",
      zIndex: 10,
      width: "100%",
      maxHeight: "15rem",
      overflow: "auto",
      border: `1px solid ${theme.palette.gray[20]}`,
      borderRadius: "0.5rem",
      boxShadow: theme.shadows[1],
    })}
  >
    {props.children}
  </Box>
);

const ResultItem: React.FC<{
  sx?: SxProps<Theme>;
}> = ({ sx, ...props }) => {
  const theme = useTheme();

  return (
    <Box
      component="li"
      sx={{
        display: "flex",
        backgroundColor: theme.palette.gray[10],
        border: "none",
        padding: 1,
        cursor: "pointer",
        textOverflow: "ellipsis",
        overflow: "hidden",
        "&:hover": {
          backgroundColor: theme.palette.gray[20],
        },
        ...sx,
      }}
      {...props}
    />
  );
};

/** extends react's useState by returning an additional value updated after a short delay (debounce) */
const useQueryText = (): [string, string, (queryText: string) => void] => {
  const [displayedQuery, setDisplayedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const setSubmittedQuerySoon = useDebounce(setSubmittedQuery, 300);

  const setQuery = useCallback(
    (query: string) => {
      setDisplayedQuery(query);
      setSubmittedQuerySoon(query);
    },
    [setDisplayedQuery, setSubmittedQuerySoon],
  );

  return [displayedQuery, submittedQuery, setQuery];
};

const SearchBarWhenSearchIsEnabled: React.VFC = () => {
  const theme = useTheme();

  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [isResultListVisible, setResultListVisible] = useState(false);
  const [displayedQuery, submittedQuery, setQueryText] = useQueryText();

  const [displaySearchInput, setDisplaySearchInput] = useState<boolean>(false);

  useEffect(() => {
    if (displayedQuery.trim() && !displaySearchInput) {
      setDisplaySearchInput(true);
    }
  }, [displayedQuery, displaySearchInput]);

  const { user } = useUser();

  const { data, loading } = useQuery<
    SearchPagesQuery,
    SearchPagesQueryVariables
  >(searchPages, {
    variables: { accountId: user?.accountId!, query: submittedQuery },
    skip: !user?.accountId || !submittedQuery,
    fetchPolicy: "network-only",
  });

  useKey(["Escape"], () => setResultListVisible(false));

  const [rootRef] = useOutsideClickRef(() => setResultListVisible(false));

  // present loading screen while waiting for the user to stop typing
  const isLoading = loading || displayedQuery !== submittedQuery;

  return (
    <Box
      sx={{
        marginLeft: 0,
        [theme.breakpoints.up("md")]: {
          marginLeft: theme.spacing(3),
        },
        position: "relative",
        height: "100%",
        ...(isMobile && displaySearchInput
          ? {
              position: "absolute",
              width: "100%",
              zIndex: 1,
              left: 0,
              top: theme.spacing(1.5),
              px: 2,
            }
          : {}),
      }}
      ref={rootRef}
    >
      {/* If the user is in mobile view and the search icon isn't clicked, display the icon */}
      {isMobile && !displaySearchInput ? (
        <IconButton
          sx={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            mr: 2,
          }}
          onClick={() => setDisplaySearchInput(true)}
        >
          <SearchIcon sx={{ height: theme.spacing(2), width: "auto" }} />
        </IconButton>
      ) : (
        <Box
          style={{
            display: "flex",
            width: "100%",
            background: "white",
            zIndex: 1,
          }}
        >
          <SearchInput
            displayedQuery={displayedQuery}
            isMobile={isMobile}
            setQueryText={setQueryText}
            setResultListVisible={setResultListVisible}
          />

          {isMobile && (
            <Box
              component="span"
              sx={(theme) => ({ marginLeft: theme.spacing(2) })}
            >
              <Button
                onClick={() => {
                  setQueryText("");
                  setDisplaySearchInput(false);
                }}
                variant="tertiary_quiet"
              >
                Cancel
              </Button>
            </Box>
          )}
        </Box>
      )}

      {isResultListVisible && displayedQuery && (
        <ResultList isMobile={isMobile}>
          {isLoading ? (
            <ResultItem sx={{ display: "block" }}>
              Loading results for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : !data?.searchPages.length ? (
            <ResultItem sx={{ display: "block" }}>
              No results found for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : (
            data.searchPages.map((searchPage) => (
              <ResultItem
                key={searchPage.block?.entityId ?? searchPage.page.entityId}
              >
                <Link noLinkStyle href={toBlockUrl(searchPage)}>
                  <a>
                    {splitByMatches(searchPage.content, submittedQuery).map(
                      (str, i) => (i % 2 === 1 ? <b>{str}</b> : str),
                    )}
                  </a>
                </Link>
              </ResultItem>
            ))
          )}
        </ResultList>
      )}
    </Box>
  );
};

const SearchBarWhenSearchIsDisabled: VoidFunctionComponent = () => {
  return <div />;
};

// Note: This component becomes empty is opensearch is disabled
export const SearchBar =
  HASH_OPENSEARCH_ENABLED === "true"
    ? SearchBarWhenSearchIsEnabled
    : SearchBarWhenSearchIsDisabled;
