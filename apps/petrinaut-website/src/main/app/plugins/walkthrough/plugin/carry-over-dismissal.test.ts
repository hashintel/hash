/** @vitest-environment jsdom */
import { afterEach, expect, test } from "vitest";

import { carryOverWalkthroughDismissal } from "./carry-over-dismissal";

const pluginKey = "petrinaut:plugin:website.walkthrough";
const editorKey = "petrinaut:user-settings";

afterEach(() => {
  localStorage.clear();
});

test("a guide dismissed before it was a plugin stays dismissed", () => {
  localStorage.setItem(
    editorKey,
    JSON.stringify({ showWalkthroughOnInit: false }),
  );

  carryOverWalkthroughDismissal();

  expect(JSON.parse(localStorage.getItem(pluginKey) ?? "null")).toEqual({
    showOnInit: false,
  });
});

test("the plugin's own setting, an undismissed guide and corrupt settings are left alone", () => {
  localStorage.setItem(
    editorKey,
    JSON.stringify({ showWalkthroughOnInit: false }),
  );
  localStorage.setItem(pluginKey, JSON.stringify({ showOnInit: true }));
  carryOverWalkthroughDismissal();
  expect(localStorage.getItem(pluginKey)).toBe(
    JSON.stringify({ showOnInit: true }),
  );

  localStorage.clear();
  localStorage.setItem(
    editorKey,
    JSON.stringify({ showWalkthroughOnInit: true }),
  );
  carryOverWalkthroughDismissal();
  localStorage.setItem(editorKey, "{");
  carryOverWalkthroughDismissal();
  expect(localStorage.getItem(pluginKey)).toBeNull();
});
