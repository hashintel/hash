import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import browser from "webextension-polyfill";

export const retrieveUser = async () => {
  const { user } = await browser.storage.session.get("user");

  return (user as Simplified<User> | null | undefined) ?? null;
};

export const storeUser = (user: Simplified<User> | null) => {
  return browser.storage.session.set({ user });
};
