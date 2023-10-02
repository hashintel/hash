import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";

export const retrieveUser = () => {
  const user = window.sessionStorage.getItem("user");
  if (user) {
    return JSON.parse(user) as Simplified<User>;
  } else {
    return null;
  }
};

export const storeUser = (user: Simplified<User> | null) => {
  return window.sessionStorage.setItem(
    "user",
    user ? JSON.stringify(user) : "",
  );
};
