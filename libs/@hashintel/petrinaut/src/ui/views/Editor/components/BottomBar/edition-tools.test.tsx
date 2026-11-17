/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CompositionContext } from "../../../../../react/state/composition-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { EditionTools } from "./edition-tools";

import type { PetrinautRules } from "@hashintel/petrinaut-core";

afterEach(cleanup);

const renderTools = (rules: PetrinautRules) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SDCPNContext value={{ ...use(SDCPNContext), readonly: false }}>
      <CompositionContext value={{ ...use(CompositionContext), rules }}>
        {children}
      </CompositionContext>
    </SDCPNContext>
  );
  render(<EditionTools editionMode="cursor" onEditionModeChange={() => {}} />, {
    wrapper: Wrapper,
  });
  return screen.queryAllByRole("button").map((button) => button.ariaLabel);
};

describe("the edition tools", () => {
  it("draw places and transitions", () => {
    expect(renderTools({})).toEqual(["Add place mode", "Add transition mode"]);
  });

  it("offer nothing in an editor that only composes: it places from the Components panel", () => {
    expect(renderTools({ edit: "compose" })).toEqual([]);
  });
});
