import { useQuery } from "@apollo/client";
import { PageSearchResult } from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { escapeRegExp } from "lodash";
import Link from "next/link";
import React, { useRef, useState } from "react";
import { useDebounce, useKey, useKeys, useOutsideClickRef } from "rooks";
import { apply, tw } from "twind";
import { blockDomId } from "../../../blocks/page/BlockView";
import {
  SearchPagesQuery,
  SearchPagesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { searchPages } from "../../../graphql/queries/search.queries";
import { useUser } from "../../hooks/useUser";
import { SearchIcon } from "../../Icons/SearchIcon";

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

const resultList = apply`absolute z-10 w-1/2 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`;
const resultItem = apply`flex border border-gray-100 bg-gray-50 p-2 hover:bg-gray-100 cursor-pointer overflow-ellipsis overflow-hidden`;

export const SearchBar: React.VFC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setFocused] = useState(false);
  const [displayedQuery, setDisplayedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery_] = useState("");
  const setSubmittedQuery = useDebounce(setSubmittedQuery_, 300);

  const { user } = useUser();

  const { data, loading } = useQuery<
    SearchPagesQuery,
    SearchPagesQueryVariables
  >(searchPages, {
    variables: { accountId: user?.accountId!, query: submittedQuery },
    skip: !user?.accountId || !submittedQuery,
    fetchPolicy: "network-only",
  });

  useKeys(["AltLeft", "KeyK"], () => inputRef.current?.focus());

  const [rootRef] = useOutsideClickRef(() => setFocused(false));

  useKey(["Escape"], () => setFocused(false));

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
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          const value = event.target.value;
          setFocused(true);
          setDisplayedQuery(value);
          setSubmittedQuery(value);
        }}
      />
      {isFocused && displayedQuery && (
        <ul className={tw`${resultList}`}>
          {isLoading ? (
            <li className={tw`${resultItem}`}>
              Loading results for&nbsp;<b>{submittedQuery}</b>.
            </li>
          ) : !data || !data.searchPages.length ? (
            <li className={tw`${resultItem}`}>
              No results found for&nbsp;<b>{submittedQuery}</b>.
            </li>
          ) : (
            data.searchPages.map((searchPage: PageSearchResult) => (
              <li
                key={searchPage.block?.entityId}
                className={tw`${resultItem}`}
              >
                <Link href={toBlockUrl(searchPage)}>
                  <a>
                    {splitByMatches(searchPage.content, submittedQuery).map(
                      (str, i) => (i % 2 === 1 ? <b>{str}</b> : str),
                    )}
                  </a>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
