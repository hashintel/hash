/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IntegrationIcon } from "./integration-icon";
import {
  integrationIconCategories,
  integrationIconCatalog,
  integrationIconNameByIntegration,
} from "./integration-icon-catalog";

describe("IntegrationIcon", () => {
  it("preserves reviewed categories for every brand in the published catalogue", () => {
    const metadata = JSON.parse(
      readFileSync(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          "integration-icon/brands.json",
        ),
        "utf8",
      ),
    ) as { name: string; categories: string[] }[];
    const categoriesByName = new Map(
      metadata.map((brand) => [brand.name, brand.categories]),
    );
    const categoryNames = new Set<string>(integrationIconCategories);
    const usedCategories = new Set<string>();
    for (const icon of integrationIconCatalog) {
      expect(icon.category).toBe("Integrations");
      expect(icon.categories).toEqual(categoriesByName.get(icon.name));
      if (icon.name === "genericApp") {
        expect(icon.categories).toHaveLength(0);
        continue;
      }
      expect(icon.categories.length).toBeGreaterThan(0);
      expect(new Set(icon.categories).size).toBe(icon.categories.length);
      for (const category of icon.categories) {
        expect(categoryNames.has(category)).toBe(true);
        expect(category.trim()).toBe(category);
        usedCategories.add(category);
      }
    }
    expect(usedCategories).toEqual(categoryNames);
  });

  it(
    "ships self-contained standalone SVGs for every advertised variant",
    { timeout: 30_000 },
    () => {
      for (const icon of integrationIconCatalog) {
        for (const variant of icon.variants) {
          const content = readFileSync(
            resolve(
              dirname(fileURLToPath(import.meta.url)),
              `../assets/integrations/${icon.slug}/${variant}.svg`,
            ),
            "utf8",
          );
          const document = new DOMParser().parseFromString(
            content,
            "image/svg+xml",
          );
          expect(
            document.querySelector("parsererror, script, foreignObject"),
          ).toBeNull();
          expect(
            document.querySelector(
              "[gradient-units], [gradient-transform], [mask-units], [filter-units], [std-deviation]",
            ),
          ).toBeNull();
          const ids = new Set(
            Array.from(document.querySelectorAll("[id]"), (node) => node.id),
          );
          for (const reference of content.matchAll(
            /(?:url\(#|href="#)([^)"\s]+)/g,
          )) {
            expect(ids.has(reference[1] ?? "")).toBe(true);
          }
        }
      }
    },
  );

  it("maps the directory entries and additional brands separately", () => {
    expect(Object.keys(integrationIconNameByIntegration)).toHaveLength(1037);
    expect(new Set(Object.values(integrationIconNameByIntegration)).size).toBe(
      992,
    );
    expect(integrationIconNameByIntegration["Microsoft Teams"]).toBe(
      "microsoftTeams",
    );
    expect(
      integrationIconCatalog.find(
        (icon) => icon.name === "microsoftTeamsLegacy",
      )?.integrationNames,
    ).toEqual([]);
    expect(integrationIconNameByIntegration["Granola"]).toBe("granola");
    expect(
      integrationIconCatalog.find((icon) => icon.name === "granolaLegacy")
        ?.integrationNames,
    ).toEqual([]);
    expect(integrationIconNameByIntegration["Amazon"]).toBe("amazon");
    expect(integrationIconNameByIntegration["AWS"]).toBe("aws");
    expect(integrationIconNameByIntegration["Amazon S3"]).toBe("amazonS3");
    expect(integrationIconNameByIntegration["OpenAI"]).toBe("openai");
    expect(integrationIconNameByIntegration["OpenAI ChatGPT"]).toBe("chatgpt");
    expect(integrationIconNameByIntegration["Anthropic"]).toBe("anthropic");
    expect(integrationIconNameByIntegration["Anthropic Claude"]).toBe("claude");
    expect(integrationIconNameByIntegration["X"]).toBe("x");
    expect(
      integrationIconCatalog.find((icon) => icon.name === "twitterLegacy")
        ?.integrationNames,
    ).toEqual([]);
    expect(integrationIconNameByIntegration["HASH"]).toBe("hash");
    expect(integrationIconNameByIntegration["Amazon Redshift"]).toBe(
      "amazonRedshift",
    );
    expect(integrationIconNameByIntegration["Apple"]).toBe("apple");
    expect(integrationIconNameByIntegration["Apple Notes"]).toBe("appleNotes");
    expect(integrationIconNameByIntegration["Apple Health"]).toBe(
      "appleHealth",
    );
    expect(integrationIconNameByIntegration["Messenger"]).toBe("messenger");
    expect(
      integrationIconCatalog.find((icon) => icon.name === "messengerLegacy")
        ?.integrationNames,
    ).toEqual([]);
    expect(integrationIconNameByIntegration["Kinaxis"]).toBe("kinaxis");
    expect(integrationIconNameByIntegration["Kinaxis Maestro"]).toBe(
      "kinaxisMaestro",
    );
    expect(integrationIconNameByIntegration["Oracle Cloud HCM"]).toBe("oracle");
    expect(integrationIconNameByIntegration["Cloudflare D1"]).toBe(
      "cloudflare",
    );
    expect(integrationIconNameByIntegration["Rockstar Games"]).toBe(
      "rockstarGames",
    );
    expect(integrationIconNameByIntegration["Take Two"]).toBe(
      "takeTwoInteractive",
    );
    expect(
      integrationIconCatalog.find(
        (icon) => icon.name === "brand20thCenturyFoxLegacy",
      )?.integrationNames,
    ).toEqual([]);
  });

  it(
    "renders every advertised variant and isolates repeated SVG references",
    { timeout: 30_000 },
    () => {
      for (const icon of integrationIconCatalog) {
        const content = renderToStaticMarkup(
          <>
            {[0, 1].map((copy) =>
              icon.variants.map((variant) => (
                <IntegrationIcon
                  key={`${copy}-${icon.name}-${variant}`}
                  name={icon.name}
                  variant={variant}
                />
              )),
            )}
          </>,
        );
        const document = new DOMParser().parseFromString(content, "text/html");
        const ids = Array.from(
          document.querySelectorAll("[id]"),
          (node) => node.id,
        );
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
        for (const reference of content.matchAll(/url\(#([^)]*)\)/g)) {
          expect(uniqueIds.has(reference[1] ?? "")).toBe(true);
        }
        expect(content).not.toContain("undefined");
        expect(document.querySelector("script, foreignObject")).toBeNull();
        for (const image of document.querySelectorAll("image")) {
          expect(
            image.getAttribute("href") ?? image.getAttribute("xlink:href"),
          ).toMatch(/^data:image\/png;base64,/);
        }
      }
    },
  );

  it("uses the caller's fill for the complete mono artwork", () => {
    const content = renderToStaticMarkup(
      <IntegrationIcon name="figma" variant="mark-mono" fill="#3676CB" />,
    );
    const document = new DOMParser().parseFromString(content, "text/html");
    expect(document.querySelector("svg")?.getAttribute("color")).toBe(
      "#3676CB",
    );
    expect(document.querySelector("feFlood")?.getAttribute("flood-color")).toBe(
      "currentColor",
    );
    expect(document.querySelector("feColorMatrix")).not.toBeNull();
  });

  it("clips app artwork to translucent rounded tiles and keeps SAP left aligned", () => {
    for (const variant of ["app-light", "app-dark"] as const) {
      const content = renderToStaticMarkup(
        <IntegrationIcon name="sap" variant={variant} />,
      );
      const document = new DOMParser().parseFromString(content, "text/html");
      const tile = document.querySelector('rect[fill^="url("]');
      const gradientId = tile?.getAttribute("fill")?.slice(5, -1) ?? "";
      const stops = document
        .getElementById(gradientId)
        ?.querySelectorAll("stop");
      expect(stops?.length).toBeGreaterThan(0);
      for (const stop of stops ?? []) {
        expect(Number(stop.getAttribute("stop-opacity"))).toBeGreaterThan(0);
        expect(Number(stop.getAttribute("stop-opacity"))).toBeLessThan(1);
      }
      expect(document.querySelector("g[clip-path]")).not.toBeNull();
      expect(
        document.querySelector("g[clip-path] > svg")?.getAttribute("x"),
      ).toBe("0");
    }
  });

  it("sizes a full lock-up to its natural aspect ratio", () => {
    const content = renderToStaticMarkup(
      <IntegrationIcon name="slack" variant="logo-light" size={32} />,
    );
    const document = new DOMParser().parseFromString(content, "text/html");
    const icon = document.querySelector("svg");
    expect(Number(icon?.getAttribute("height"))).toBe(32);
    expect(Number(icon?.getAttribute("width"))).toBeGreaterThan(80);
  });

  it("labels requested icons and hides decorative ones", () => {
    const content = renderToStaticMarkup(
      <>
        <IntegrationIcon name="linear" title="Connect Linear" />
        <IntegrationIcon name="linear" />
      </>,
    );
    const document = new DOMParser().parseFromString(content, "text/html");
    const labelled = document.querySelector('svg[role="img"]');
    expect(
      document.getElementById(labelled?.getAttribute("aria-labelledby") ?? "")
        ?.textContent,
    ).toBe("Connect Linear");
    expect(document.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(
      1,
    );
  });
});
