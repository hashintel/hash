// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import {
  useWordsPreference,
  wordsPreferenceStorageKey,
} from "./words-preference";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("Words defaults off and accepts only literal true", () => {
  localStorage.setItem(wordsPreferenceStorageKey, "TRUE");
  const hook = renderHook(useWordsPreference);
  expect(hook.result.current.enabled).toBe(false);
  act(() => hook.result.current.setEnabled(true));
  expect(localStorage.getItem(wordsPreferenceStorageKey)).toBe("true");
});
