/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IntegrationIcon } from "./integration-icon";
import {
  integrationIconCatalog,
  integrationIconNameByIntegration,
} from "./integration-icon-catalog";

describe("IntegrationIcon", () => {
  it("ships self-contained standalone SVGs for every advertised variant", () => {
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
  });

  it("maps the directory entries and additional brands separately", () => {
    expect(Object.keys(integrationIconNameByIntegration)).toHaveLength(51);
    expect(new Set(Object.values(integrationIconNameByIntegration)).size).toBe(
      47,
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
    expect(integrationIconNameByIntegration["Kinaxis"]).toBe("kinaxis");
    expect(integrationIconNameByIntegration["Kinaxis Maestro"]).toBe(
      "kinaxisMaestro",
    );
    expect(integrationIconNameByIntegration["Oracle Cloud HCM"]).toBe("oracle");
    expect(integrationIconNameByIntegration["Cloudflare D1"]).toBe(
      "cloudflare",
    );
  });

  it("renders every advertised variant and isolates repeated SVG references", () => {
    const content = renderToStaticMarkup(
      <>
        {[0, 1].map((copy) =>
          integrationIconCatalog.map((icon) =>
            icon.variants.map((variant) => (
              <IntegrationIcon
                key={`${copy}-${icon.name}-${variant}`}
                name={icon.name}
                variant={variant}
              />
            )),
          ),
        )}
      </>,
    );
    const document = new DOMParser().parseFromString(content, "text/html");
    const ids = Array.from(
      document.querySelectorAll("[id]"),
      (node) => node.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const reference of content.matchAll(/url\(#([^)]*)\)/g)) {
      expect(ids).toContain(reference[1]);
    }
    expect(content).not.toContain("undefined");
    expect(document.querySelector("script, foreignObject")).toBeNull();
    for (const image of document.querySelectorAll("image")) {
      expect(
        image.getAttribute("href") ?? image.getAttribute("xlink:href"),
      ).toMatch(/^data:image\/png;base64,/);
    }
  });

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
