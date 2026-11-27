import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Kbd } from "./kbd";

const withoutAttributes = (markup: string): string =>
  markup.replaceAll(/<(\w+)[^>]*>/g, "<$1>");

describe("Kbd", () => {
  it("nests one kbd per key in a hidden outer kbd, beside a spoken label", () => {
    const markup = renderToStaticMarkup(
      <Kbd keys="mod+shift+z" platform="apple" />,
    );
    expect(markup.match(/aria-hidden="true"/g)).toHaveLength(1);
    expect(withoutAttributes(markup)).toBe(
      "<span><span>Shift Command Z</span>" +
        "<kbd><kbd>⇧</kbd><kbd>⌘</kbd><kbd>Z</kbd></kbd></span>",
    );
  });

  it("joins the keys of a combination with a plus sign on PC only", () => {
    expect(
      withoutAttributes(
        renderToStaticMarkup(<Kbd keys="mod+shift+z" platform="pc" />),
      ),
    ).toContain("<kbd><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></kbd>");
    expect(
      withoutAttributes(renderToStaticMarkup(<Kbd keys="k" platform="pc" />)),
    ).toContain("<kbd><kbd>K</kbd></kbd>");
  });

  it("detects the platform by default, rendering PC labels on the server", () => {
    const markup = renderToStaticMarkup(<Kbd keys="mod+k" />);
    expect(markup).toContain(">Ctrl</kbd>");
    expect(markup).toContain(">Control K</span>");
    expect(renderToStaticMarkup(<Kbd keys="mod+k" platform="auto" />)).toBe(
      markup,
    );
  });

  it("pins the labels to an explicit platform", () => {
    expect(renderToStaticMarkup(<Kbd keys="mod+k" platform="pc" />)).toContain(
      ">Ctrl</kbd>",
    );
    expect(
      renderToStaticMarkup(<Kbd keys="mod+k" platform="apple" />),
    ).toContain(">⌘</kbd>");
  });

  it("renders nothing without keys", () => {
    expect(renderToStaticMarkup(<Kbd keys="" />)).toBe("");
  });
});
