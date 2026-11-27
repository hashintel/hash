/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CompositionContext } from "../../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../../react/document/sdcpn-context";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { EditionTools } from "./edition-tools";

import type { PetrinautRules } from "@hashintel/petrinaut-core";

afterEach(cleanup);

const renderTools = ({
  rules = {},
  enableNetComponents = false,
}: {
  rules?: PetrinautRules;
  enableNetComponents?: boolean;
}) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SDCPNContext value={{ ...use(SDCPNContext), readonly: false }}>
      <UserSettingsContext
        value={{ ...use(UserSettingsContext), enableNetComponents }}
      >
        <CompositionContext value={{ ...use(CompositionContext), rules }}>
          {children}
        </CompositionContext>
      </UserSettingsContext>
    </SDCPNContext>
  );
  render(<EditionTools />, { wrapper: Wrapper });
  return screen.queryAllByRole("button").map((button) => button.ariaLabel);
};

describe("the edition tools", () => {
  it("draw places and transitions", () => {
    expect(renderTools({})).toEqual(["Add place mode", "Add transition mode"]);
  });

  it("place components too once Net Components is on", () => {
    expect(renderTools({ enableNetComponents: true })).toEqual([
      "Add place mode",
      "Add transition mode",
      "Add component",
    ]);
  });

  it("offer nothing in an editor that only composes: it places from the Components panel", () => {
    expect(renderTools({ rules: { edit: "compose" } })).toEqual([]);
  });
});
