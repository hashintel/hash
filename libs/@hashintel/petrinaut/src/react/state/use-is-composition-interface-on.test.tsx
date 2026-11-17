/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautRules,
} from "@hashintel/petrinaut-core";

import { CompositionContext } from "./composition-context";
import { SDCPNContext } from "./sdcpn-context";
import { useIsCompositionInterfaceOn } from "./use-is-composition-interface-on";
import { UserSettingsContext } from "./user-settings-context";

const isOn = ({
  enableNetComponents = false,
  rules = {},
  components = true,
}: {
  enableNetComponents?: boolean;
  rules?: PetrinautRules;
  components?: boolean;
}) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SDCPNContext
      value={{
        ...use(SDCPNContext),
        extensions: { ...DEFAULT_PETRINAUT_EXTENSIONS, components },
      }}
    >
      <UserSettingsContext
        value={{ ...use(UserSettingsContext), enableNetComponents }}
      >
        <CompositionContext value={{ ...use(CompositionContext), rules }}>
          {children}
        </CompositionContext>
      </UserSettingsContext>
    </SDCPNContext>
  );
  return renderHook(useIsCompositionInterfaceOn, { wrapper: Wrapper }).result
    .current;
};

describe("the composition interface", () => {
  it("is off until the user switches Net Components on", () => {
    expect(isOn({})).toBe(false);
    expect(isOn({ enableNetComponents: true })).toBe(true);
  });

  it("is on whatever the setting says where the host keeps the editor to composing", () => {
    expect(isOn({ rules: { edit: "compose" } })).toBe(true);
    expect(isOn({ rules: { edit: "all" } })).toBe(false);
  });

  it("is off over a document that cannot hold components", () => {
    expect(isOn({ enableNetComponents: true, components: false })).toBe(false);
    expect(isOn({ rules: { edit: "compose" }, components: false })).toBe(false);
  });
});
