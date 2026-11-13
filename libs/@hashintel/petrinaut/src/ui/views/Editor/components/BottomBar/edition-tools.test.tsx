/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { resolveProvidedComponents } from "@hashintel/petrinaut-core";

import { CompositionContext } from "../../../../../react/state/composition-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { EditionTools } from "./edition-tools";

afterEach(cleanup);

const provided = resolveProvidedComponents([
  {
    id: "warehouse/packer",
    name: "Packer",
    ports: [{ name: "Orders", direction: "in" }],
  },
]);

const renderTools = (compositionOnly: boolean) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SDCPNContext value={{ ...use(SDCPNContext), readonly: false }}>
      <CompositionContext value={{ provided, compositionOnly }}>
        {children}
      </CompositionContext>
    </SDCPNContext>
  );
  render(<EditionTools editionMode="cursor" onEditionModeChange={() => {}} />, {
    wrapper: Wrapper,
  });
  return screen.getAllByRole("button").map((button) => button.ariaLabel);
};

describe("the edition tools", () => {
  it("draw places and transitions, and place components", () => {
    expect(renderTools(false)).toEqual([
      "Add place mode",
      "Add transition mode",
      "Add component",
    ]);
  });

  it("only place components in an editor that only composes", () => {
    expect(renderTools(true)).toEqual(["Add component"]);
  });
});
