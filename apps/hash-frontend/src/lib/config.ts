export const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

/**
 * To prevent clashes, this `localStorageKeys` object contains all the local storage
 * keys used by HASH in the browser.
 */
export const localStorageKeys = {
  workspaceWebId: "workspaceWebId",
  // TODO(FE-2185): store recent actions in the graph instead of local storage
  /** Suffixed with the user's account ID, so it's kept for each user after signing out. */
  recentFlowActions: "recentFlowActions",
} as const;

export const resetLocalStorage = () => {
  for (const localStorageKey of Object.values(localStorageKeys)) {
    localStorage.removeItem(localStorageKey);
  }
};

export const isBrowser = typeof window !== "undefined";
