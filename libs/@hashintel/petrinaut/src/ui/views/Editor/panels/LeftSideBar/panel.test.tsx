/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompositionContext } from "../../../../../react/state/composition-context";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { LeftSideBar } from "./panel";

import type { SubView } from "../../../../components/sub-view/types";
import type { PetrinautRules } from "@hashintel/petrinaut-core";

// The panels are told apart by their titles: what each one draws is its own.
vi.mock(
  "../../../../components/sub-view/vertical/vertical-sub-views-container",
  () => ({
    VerticalSubViewsContainer: ({ subViews }: { subViews: SubView[] }) =>
      subViews.map(({ id, title }) => <h2 key={id}>{title}</h2>),
  }),
);

afterEach(cleanup);

const logistics = "@hashintel/logistics";

const panels = ({
  enableNetComponents = false,
  rules = {},
  offered = [logistics],
}: {
  enableNetComponents?: boolean;
  rules?: PetrinautRules;
  offered?: readonly string[];
}) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <UserSettingsContext
      value={{ ...use(UserSettingsContext), enableNetComponents }}
    >
      <CompositionContext
        value={{ ...use(CompositionContext), offered, rules }}
      >
        {children}
      </CompositionContext>
    </UserSettingsContext>
  );
  render(<LeftSideBar />, { wrapper: Wrapper });
  const titles = screen
    .getAllByRole("heading")
    .map((heading) => heading.textContent)
    .filter((title) => title !== "Search");
  cleanup();
  return titles;
};

describe("the left sidebar", () => {
  it("hides the Nets and Components panels until Net Components is on", () => {
    expect(panels({})).toEqual(["Entities"]);
    expect(panels({ enableNetComponents: true })).toEqual([
      "Entities",
      "Nets",
      "Components",
    ]);
  });

  it("shows the Components panel alone in an editor that only composes, whatever the setting says", () => {
    expect(panels({ rules: { edit: "compose" } })).toEqual(["Components"]);
    expect(
      panels({ rules: { edit: "compose" }, enableNetComponents: true }),
    ).toEqual(["Components"]);
  });

  it("has no Components panel where the host offers no library", () => {
    expect(panels({ enableNetComponents: true, offered: [] })).toEqual([
      "Entities",
      "Nets",
    ]);
  });
});
