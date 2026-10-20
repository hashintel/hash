/**
 * scip-python names a module by the project that indexed it and by its path
 * from `--cwd`, so the same module has two names when a consumer resolves it
 * through its environment. Dropping the project prefix and the `src.` root
 * segment gives one name for both; TypeScript symbols already agree.
 */
export const canonicalSymbol = (symbol: string): string =>
  symbol.startsWith("scip-python ")
    ? `py ${symbol
        .replace(/^scip-python python \S+ \S+ /u, "")
        .replace(/^`src\.([^`]+)`/u, "$1")}`
    : symbol;
