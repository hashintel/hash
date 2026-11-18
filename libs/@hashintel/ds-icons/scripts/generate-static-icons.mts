import { writeFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HashIcon, hashIconNames } from "../dist/index.js";

const artwork = Object.fromEntries(
  hashIconNames.map((name) => [
    name,
    Object.fromEntries(
      (["outline", "filled"] as const).map((variant) => {
        const svg = renderToStaticMarkup(
          createElement(HashIcon, {
            name,
            variant,
            motion: "none",
            hover: "none",
            interaction: "none",
          }),
        );
        let body = svg
          .slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"))
          .replace(/ (?:class|data-[\w-]+)="[^"]*"/g, "")
          .replace(/ style="([^"]*)"/g, (_: string, style: string) => {
            const kept = style
              .split(";")
              .filter(
                (rule) => !/^(?:transition|animation|--petricon)/.test(rule),
              )
              .join(";");
            return kept ? ` style="${kept}"` : "";
          });
        const ids = [...body.matchAll(/ id="([^"]+)"/g)].map(
          (match) => match[1]!,
        );
        for (const [index, id] of ids.entries()) {
          body = body.replaceAll(id, `__HASH_ICON_ID_${index}__`);
        }
        return [variant, body];
      }),
    ),
  ]),
);
await writeFile(
  new URL("../src/static/artwork.json", import.meta.url),
  `${JSON.stringify(artwork, null, 2)}\n`,
);
