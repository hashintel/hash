import { useEffect, useState } from "react";
import browser from "webextension-polyfill";

import { SessionStorage } from "../../shared/storage";

/**
 * A hook to keep React state synced with session storage shared across the extension.
 *
 * Note that storage access is asynchronous, and therefore the first value returned will always be the initialValue.
 *
 * @param initialValue the value to initialise the state with
 * @param key the key for the value in session storage
 *
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage
 */
export const useSessionStorage = <Key extends keyof SessionStorage>(
  key: Key,
  initialValue: SessionStorage[Key],
) => {
  const [stateValue, setStateValue] =
    useState<SessionStorage[Key]>(initialValue);
  const [storageChecked, setStorageChecked] = useState(false);

  useEffect(() => {
    const getStorageValue = async () => {
      const storageValue = (await browser.storage.local.get(key)) as Record<
        Key,
        SessionStorage[Key]
      >;
      setStateValue(storageValue[key]);
      setStorageChecked(true);
    };

    void getStorageValue();
  }, [key]);

  const setValue = (newValue: SessionStorage[Key]) => {
    setStateValue(newValue);
    void browser.storage.local.set({ [key]: newValue });
  };

  return [stateValue, setValue, storageChecked] as const;
};
