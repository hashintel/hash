import React, { useLayoutEffect, useRef, useState } from "react";
import { useDebounce, useKey, useKeys } from "rooks";
import { tw, apply } from "twind";

import SearchIcon from "../../Icons/Search";

/** mock service response interface */
interface SearchResponse {
  query: string;
  matches: Array<{ pageEntityVersionId?: string; pageTitle: string }>;
}

/** mock service response instance */
const mockResponse: SearchResponse = {
  query: "query",
  matches: [{ pageTitle: "First Result" }, { pageTitle: "Second Result" }],
};

/** mock implementation of "@apollo/client" useQuery */
const useQuery: (...args: any[]) => {
  data: SearchResponse | null;
  loading: boolean;
} = (_, options) => {
  const query = options.variables.query;
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // using layout-effect to avoid glitches
  useLayoutEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setData(query === "prettyplease" ? mockResponse : null);
    }, 700);
  }, [query]);

  return { data, loading };
};

const resultList = apply`absolute z-10 w-1/2 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`;
const resultItem = apply`flex border border-gray-100 bg-gray-50 p-2 hover:bg-gray-100 cursor-pointer`;

export const SearchBar: React.VFC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setFocused] = useState(false);
  const [displayedQuery, setDisplayedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery_] = useState("");
  const setSubmittedQuery = useDebounce(setSubmittedQuery_, 300);

  const { data, loading } = useQuery("yet irrelevant", {
    variables: { query: submittedQuery },
  });

  useKeys(["AltLeft", "KeyK"], () => inputRef.current?.focus());

  useKey(["Escape"], () => setFocused(false));

  // present loading screen while waiting for the user to stop typing
  const isLoading = loading || displayedQuery !== submittedQuery;

  return (
    <div className={tw`relative h-full w-full`}>
      <div className={tw`absolute h-full flex flex-row items-center`}>
        <SearchIcon className={tw`m-2 scale-150`}/>
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
              Loading results for {displayedQuery}
            </li>
          ) : !data ? (
            <li className={tw`${resultItem}`}>
              No results for {displayedQuery}, try "prettyplease"
            </li>
          ) : (
            data.matches.map((match) => (
              <li key={match.pageTitle} className={tw`${resultItem}`}>
                {match.pageTitle}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
