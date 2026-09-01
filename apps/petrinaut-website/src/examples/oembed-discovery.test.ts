import { describe, expect, it } from "vitest";

import { getOEmbedDiscoveryUrl } from "./oembed-discovery";

describe("getOEmbedDiscoveryUrl", () => {
  it("uses the production origin without leaking a development port", () => {
    const endpoint = new URL(
      getOEmbedDiscoveryUrl("gases-1-pn", { scenario: "steady" }),
    );

    expect(endpoint.origin).toBe("https://demo.petrinaut.org");
    expect(endpoint.searchParams.get("format")).toBe("json");
    expect(endpoint.searchParams.get("url")).toBe(
      "https://demo.petrinaut.org/examples/gases-1-pn?scenario=steady",
    );
  });

  it("advertises one endpoint URL per location, whatever the address bar holds", () => {
    // A foreign parameter is not part of the contract, so it must not produce
    // a second endpoint URL for a response that is byte-identical.
    const withoutForeignParam = getOEmbedDiscoveryUrl("gases-1-pn", {
      scenario: "steady",
    });
    const withForeignParam = getOEmbedDiscoveryUrl("gases-1-pn", {
      scenario: "steady",
      ...({ utm_source: "twitter" } as Record<string, string>),
    });

    expect(withForeignParam).toBe(withoutForeignParam);
  });

  it("orders the contract parameters canonically", () => {
    expect(
      getOEmbedDiscoveryUrl("gases-2-spn", {
        subnet: "subnet-a",
        scenario: "scenario__drawing",
      }),
    ).toBe(
      getOEmbedDiscoveryUrl("gases-2-spn", {
        scenario: "scenario__drawing",
        subnet: "subnet-a",
      }),
    );
  });
});
