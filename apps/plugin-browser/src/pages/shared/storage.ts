import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";

// @todo switch to browser.storage.session (async access), or clear this when user logs out
export const retrieveUser = () => {
  const user = window.localStorage.getItem("user");
  if (user) {
    return JSON.parse(user) as Simplified<User>;
  } else {
    return null;
  }
};

export const storeUser = (user: Simplified<User> | null) => {
  return window.localStorage.setItem("user", user ? JSON.stringify(user) : "");
};
