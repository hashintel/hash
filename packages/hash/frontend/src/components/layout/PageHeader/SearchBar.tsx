import { useQuery } from "@apollo/client";
import { PageSearchResult } from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { escapeRegExp, escape } from "lodash";
import Link from "next/link";
import React, { useRef, useState } from "react";
import { useDebounce, useKey, useKeys } from "rooks";
import { apply, tw } from "twind";
import { blockDomId } from "../../../blocks/page/BlockView";
import {
  SearchPagesQuery,
  SearchPagesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { searchPages } from "../../../graphql/queries/search.queries";
import { useUser } from "../../hooks/useUser";
import SearchIcon from "../../Icons/Search";

const highlightFindings = (query: string, result: string) => {
  const toBeMatched = query
    .split(/\s+/g)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");

  const re = new RegExp(`(${toBeMatched})`, "gi");

  return result
    .split(re)
    .map((str, i) => (i % 2 === 1 ? `<b>${escape(str)}</b>` : escape(str)))
    .join("");
};

const toBlockUrl = (searchPage: PageSearchResult): string =>
  `/${searchPage.page.accountId}/${searchPage.page.entityId}${
    searchPage.block ? "#" + blockDomId(searchPage.block.entityId) : ""
  }`;

const resultList = apply`absolute z-10 w-1/2 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`;
const resultItem = apply`flex border border-gray-100 bg-gray-50 p-2 hover:bg-gray-100 cursor-pointer overflow-ellipsis overflow-hidden`;

export const SearchBar: React.VFC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setFocused] = useState(false);
  const [displayedQuery, setDisplayedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery_] = useState("");
  const setSubmittedQuery = useDebounce(setSubmittedQuery_, 300);

  const { user } = useUser();

  const { data, loading, error } = useQuery<
    SearchPagesQuery,
    SearchPagesQueryVariables
  >(searchPages, {
    variables: { accountId: user?.accountId!, query: submittedQuery },
    skip: !user?.accountId || !submittedQuery,
    fetchPolicy: "network-only"
  });

  useKeys(["AltLeft", "KeyK"], () => inputRef.current?.focus());

  useKey(["Escape"], () => setFocused(false));

  // present loading screen while waiting for the user to stop typing
  const isLoading = loading || displayedQuery !== submittedQuery;

  return (
    <div className={tw`relative h-full w-full`}>
      <div className={tw`absolute h-full flex flex-row items-center`}>
        <SearchIcon className={tw`m-2 scale-150`} />
      </div>
      <input
        className={tw`p-2 pl-10 w-1/2 border border-gray-200 rounded-lg focus:outline-none`}
        ref={inputRef}
        placeholder="Search (Alt+k)"
        type="text"
        value={displayedQuery}
        onBlur={() => setFocused(false)}
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
                  <a
                    dangerouslySetInnerHTML={{
                      __html: highlightFindings(
                        submittedQuery,
                        searchPage.content,
                      ),
                    }}
                  />
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
