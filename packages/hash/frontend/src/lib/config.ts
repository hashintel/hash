export const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

/**
 * To prevent clashes, this `localStorageKeys` object contains all the local storage
 * keys used by HASH in the browser.
 */
export const localStorageKeys = {
  workspaceAccountId: "workspaceAccountId",
} as const;

export const resetLocalStorage = () => {
  for (const localStorageKey of Object.values(localStorageKeys)) {
    localStorage.removeItem(localStorageKey);
  }
};

export const isBrowser = typeof window !== "undefined";
