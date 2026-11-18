/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../../react/lsp/context";
import { NetClassSummary } from "./net-class-summary";

import type { NetClass } from "@hashintel/petrinaut-core";

const renderSummary = (netClass: NetClass | null) =>
  render(
    <LanguageClientContext
      value={{
        ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
        netAnalysis: {
          get: () => ({ metricShapes: {}, netClass }),
          subscribe: () => () => {},
        },
      }}
    >
      <NetClassSummary />
    </LanguageClientContext>,
  );

/** The three values the summary reads, in the order it draws them. */
const values = () =>
  screen
    .getAllByRole("term")
    .map((term) => `${term.textContent}: ${term.nextSibling?.textContent}`);

describe("NetClassSummary", () => {
  afterEach(cleanup);

  it("reads the time, the colouring and the chance of the net", () => {
    renderSummary({
      time: "untimed",
      coloring: "none",
      chance: "deterministic",
    });
    expect(values()).toEqual([
      "Time: Untimed",
      "Colour: Uncoloured",
      "Chance: Deterministic",
    ]);

    cleanup();
    renderSummary({ time: "timed", coloring: "dynamic", chance: "stochastic" });
    expect(values()).toEqual([
      "Time: Timed",
      "Colour: Dynamically coloured",
      "Chance: Stochastic",
    ]);
  });

  it("says the chance is unknown while the code does not compile", () => {
    renderSummary({ time: "untimed", coloring: "static", chance: null });
    expect(values()).toEqual([
      "Time: Untimed",
      "Colour: Statically coloured",
      "Chance: Unknown",
    ]);
  });

  it("draws nothing before the first check lands", () => {
    const { container } = renderSummary(null);
    expect(container.childElementCount).toBe(0);
  });
});
