import { useCallback, useEffect, useMemo, useState } from "react";
import browser from "webextension-polyfill";

import {
  getFromLocalStorage,
  LocalStorage,
  setInLocalStorage,
} from "../../shared/storage";

/**
 * A hook to keep React state synced with local storage shared across the extension.
 *
 * NOTE:
 * 1. Storage access is asynchronous, and therefore the first value returned will always be the initialValue.
 *      if you need to know when the storage has been checked, use the third value returned from the hook.
 * 2. Because values are repeatedly serialized to and from storage, do not check by identity (e.g. array.includes(object))
 *
 * @param initialValue the value to initialise the state with
 * @param key the key for the value in local storage
 *
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage
 */
export const useLocalStorage = <Key extends keyof LocalStorage>(
  key: Key,
  initialValue: LocalStorage[Key],
) => {
  const [stateValue, setStateValue] = useState<LocalStorage[Key]>(initialValue);
  const [storageChecked, setStorageChecked] = useState(false);

  useEffect(() => {
    const getStorageValue = async () => {
      const storageValue = await getFromLocalStorage(key);

      if (typeof storageValue !== "undefined") {
        setStateValue(storageValue);
      }

      setStorageChecked(true);
    };

    void getStorageValue();
  }, [key]);

  useEffect(() => {
    const listener = (
      changes: Record<string, browser.Storage.StorageChange>,
      areaName: string,
    ) => {
      if (
        areaName === "local" &&
        key in changes &&
        changes[key].newValue !== stateValue
      ) {
        setStateValue(changes[key].newValue as LocalStorage[Key]);
      }
    };

    // Listen to changes in the storage area in case it's updated from another component, window, or background script
    browser.storage.onChanged.addListener(listener);

    return () => {
      browser.storage.onChanged.removeListener(listener);
    };
  }, [key, stateValue]);

  const setValue = useCallback(
    (newValue: LocalStorage[Key]) => {
      setStateValue(newValue);
      void setInLocalStorage(key, newValue);
    },
    [key],
  );

  return useMemo(
    () => [stateValue, setValue, storageChecked] as const,
    [stateValue, setValue, storageChecked],
  );
};
