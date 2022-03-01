import { useQuery } from "@apollo/client";
import { PageSearchResult } from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { escapeRegExp } from "lodash";
import Link from "next/link";
import React, {
  useCallback,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import { useDebounce, useKey, useKeys, useOutsideClickRef } from "rooks";
import { tw } from "twind";
import { blockDomId } from "../../../blocks/page/BlockView";
import {
  SearchPagesQuery,
  SearchPagesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { searchPages } from "../../../graphql/queries/search.queries";
import { useUser } from "../../hooks/useUser";
import { SearchIcon } from "../../icons";
import { HASH_OPENSEARCH_ENABLED } from "../../../lib/public-env";
import { alpha, Box, InputBase, styled } from "@mui/material";
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

const ResultList: React.FC = (props) => (
  <Box
    component="ul"
    sx={(theme) => ({
      position: "absolute",
      zIndex: 10,
      width: "50%",
      maxHeight: "15rem",
      overflow: "auto",
      border: `1px solid ${theme.palette.gray[20]}`,
      borderRadius: "",
    })}
    className={tw`absolute z-10 w-1/2 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`}
    {...props}
  />
);

const ResultItem: React.FC = (props) => (
  <li
    className={tw`flex border border-gray-100 bg-gray-50 p-2 hover:bg-gray-100 cursor-pointer overflow-ellipsis overflow-hidden`}
    {...props}
  />
);

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

const Search = styled("div")(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  marginRight: theme.spacing(2),
}));

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: "100%",
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const SlashIconWrapper = styled("div")(({ theme }) => ({
  margin: theme.spacing(1),
  padding: theme.spacing(0, 1),
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  top: 0,
  right: 0,
  fontWeight: "bold",
  color: theme.palette.gray[50],
  backgroundColor: theme.palette.gray[20],
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  "& .MuiInputBase-input": {
    padding: theme.spacing(1, 0, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(3)})`,
    paddingRight: `calc(1em + ${theme.spacing(3)})`,
    transition: theme.transitions.create("width"),
    width: "max-content",
    [theme.breakpoints.up("md")]: {
      width: "20ch",
    },
    border: `1px solid ${theme.palette.gray[30]}`,
    borderRadius: "6px",
  },
}));

const SearchBarWhenSearchIsEnabled: React.VFC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isResultListVisible, setResultListVisible] = useState(false);
  const [displayedQuery, submittedQuery, setQueryText] = useQueryText();

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

  useKeys(["AltLeft", "KeyK"], () => inputRef.current?.focus());

  const [rootRef] = useOutsideClickRef(() => setResultListVisible(false));

  // present loading screen while waiting for the user to stop typing
  const isLoading = loading || displayedQuery !== submittedQuery;

  return (
    <Box
      sx={(theme) => ({
        marginLeft: 0,
        [theme.breakpoints.up("sm")]: {
          marginLeft: theme.spacing(3),
        },
        position: "relative",
        height: "100%",
      })}
      ref={rootRef}
    >
      <Search>
        <SearchIconWrapper>
          <SearchIcon />
        </SearchIconWrapper>
        <StyledInputBase
          placeholder="Search for anything"
          ref={inputRef}
          type="text"
          value={displayedQuery}
          onFocus={() => setResultListVisible(true)}
          onChange={(event) => {
            setResultListVisible(true);
            setQueryText(event.target.value);
          }}
          inputProps={{ "aria-label": "search" }}
        />
        <SlashIconWrapper>/</SlashIconWrapper>
      </Search>
      {isResultListVisible && displayedQuery && (
        <ResultList>
          {isLoading ? (
            <ResultItem>
              Loading results for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : !data?.searchPages.length ? (
            <ResultItem>
              No results found for&nbsp;<b>{submittedQuery}</b>.
            </ResultItem>
          ) : (
            data.searchPages.map((searchPage) => (
              <ResultItem
                key={searchPage.block?.entityId ?? searchPage.page.entityId}
              >
                <Link href={toBlockUrl(searchPage)}>
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
  HASH_OPENSEARCH_ENABLED !== "true"
    ? SearchBarWhenSearchIsEnabled
    : SearchBarWhenSearchIsDisabled;
