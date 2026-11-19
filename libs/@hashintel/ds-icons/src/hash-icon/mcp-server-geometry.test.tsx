/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { hashIconCatalog } from "../catalog";
import { HashIcon, McpServerIcon } from "../hash-icon";

const official = new DOMParser().parseFromString(
  readFileSync(join(import.meta.dirname, "mcp-server.svg"), "utf8"),
  "image/svg+xml",
);
const officialPaths = [...official.querySelectorAll("path")].map((path) =>
  path.getAttribute("d"),
);

describe("MCP Server artwork", () => {
  it.each(["outline", "filled"] as const)(
    "preserves the official paths and proportions in the %s variant",
    (variant) => {
      const rendered = new DOMParser().parseFromString(
        renderToStaticMarkup(
          <HashIcon
            name="mcpServer"
            variant={variant}
            weight={700}
            strokeWidth={5}
            motion="none"
          />,
        ),
        "image/svg+xml",
      );
      expect(
        [...rendered.querySelectorAll("path")].map((path) =>
          path.getAttribute("d"),
        ),
      ).toEqual(officialPaths);
      const artwork = rendered.querySelector("path")?.parentElement;
      expect(artwork?.getAttribute("transform")).toBe(`scale(${24 / 180})`);
      expect(artwork?.getAttribute("stroke-width")).toBe(
        official.querySelector("path")?.getAttribute("stroke-width"),
      );
      expect(artwork?.getAttribute("stroke-linecap")).toBe("round");
      expect(artwork?.getAttribute("stroke")).toBe("currentColor");
      expect(artwork?.getAttribute("fill")).toBe("none");
    },
  );

  it("exposes the named icon and an identifiable AI catalogue entry", () => {
    expect(renderToStaticMarkup(<McpServerIcon motion="none" />)).toContain(
      'data-icon="mcpServer"',
    );
    expect(
      hashIconCatalog.find(({ name }) => name === "mcpServer"),
    ).toMatchObject({
      label: "MCP Server",
      category: "AI",
    });
  });
});
