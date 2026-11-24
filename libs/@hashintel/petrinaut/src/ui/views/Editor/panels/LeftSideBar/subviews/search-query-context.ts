import { createContext } from "react";

/**
 * The text of the search input. The input sits in the search panel's header
 * and the results in its body, so neither can hold it for the other.
 */
export const SearchQueryContext = createContext<{
  query: string;
  setQuery: (query: string) => void;
}>({ query: "", setQuery: () => {} });
