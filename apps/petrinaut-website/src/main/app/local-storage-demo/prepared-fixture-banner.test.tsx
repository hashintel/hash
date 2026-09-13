import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  PreparedFixtureBanner,
  PreparedFixtureSelector,
} from "./prepared-fixture-banner";

const bundle = {
  revision: 3,
  targetArc: "present" as const,
};

describe("PreparedFixtureBanner", () => {
  test("offers a stable labelled fixture selector below the top bar", () => {
    const markup = renderToStaticMarkup(<PreparedFixtureSelector />);

    expect(markup).toContain("Prepared fixture selector");
    expect(markup).toContain(
      "Open the labelled legacy crew-reservation fixture",
    );
    expect(markup).toContain("?brunch-fixture=crew-reservation-v1");
    // Petrinaut's top bar is 64px tall; the panel sits under it, not behind.
    expect(markup).toContain("position:fixed");
    expect(markup).toContain("top:80px");
  });

  test("visibly states authorship, non-claims, and automatic settlement", () => {
    const markup = renderToStaticMarkup(
      <PreparedFixtureBanner bundle={null} />,
    );

    expect(markup).toContain("Test-authored prepared fixture");
    expect(markup).toContain("not model-produced evidence");
    expect(markup).toContain("does not claim capture provenance");
    expect(markup).toContain("automatically mirrored document");
    expect(markup).toContain("Current Markdown workpiece");
    expect(markup).toContain("Final inspection and dispatch workpiece");
  });

  test("visibly retains the prior bundle when settlement is refused", () => {
    const markup = renderToStaticMarkup(
      <PreparedFixtureBanner
        bundle={bundle}
        settlementStatus={{
          state: "refused",
          reason: "missing-correlated-mutation",
        }}
      />,
    );

    expect(markup).toContain(
      "Settlement refused (missing-correlated-mutation)",
    );
    expect(markup).toContain("bundle revision 3 remains selected");
  });

  test("shows a selected revision as revalidating during a history gap", () => {
    const markup = renderToStaticMarkup(
      <PreparedFixtureBanner
        bundle={bundle}
        settlementStatus={{ state: "revalidating" }}
      />,
    );

    expect(markup).toContain(
      "Bundle revision 3 remains selected while canonical history reconnects",
    );
    expect(markup).toContain(
      "The selected bundle’s Markdown workpiece is unavailable",
    );
    expect(markup).not.toContain("Preparing the conversation");
  });
});
