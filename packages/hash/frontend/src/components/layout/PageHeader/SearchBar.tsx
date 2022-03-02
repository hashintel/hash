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
  <ul
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
    <div ref={rootRef} className={tw`relative h-full w-full`}>
      <div className={tw`absolute h-full flex flex-row items-center`}>
        <SearchIcon className={tw`m-2 scale-150`} />
      </div>
      <input
        className={tw`p-2 pl-10 w-1/2 border border-gray-200 rounded-lg focus:outline-none`}
        ref={inputRef}
        placeholder="Search (Alt+k)"
        type="text"
        value={displayedQuery}
        onFocus={() => setResultListVisible(true)}
        onChange={(event) => {
          setResultListVisible(true);
          setQueryText(event.target.value);
        }}
      />
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
    </div>
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
