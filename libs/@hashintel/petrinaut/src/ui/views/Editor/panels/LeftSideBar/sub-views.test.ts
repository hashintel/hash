import { describe, expect, it } from "vitest";

import { leftSidebarSubViews } from "./sub-views";

const titles = (
  state: Partial<Parameters<typeof leftSidebarSubViews>[0]>,
): string[] =>
  leftSidebarSubViews({
    composesOnly: false,
    compositionInterfaceOn: false,
    offersLibraries: true,
    ...state,
  }).map((subView) => subView.title);

describe("the left sidebar's sub-views", () => {
  it("hides the Nets and Components panels until the composition interface is on", () => {
    expect(titles({})).toEqual(["Entities"]);
    expect(titles({ compositionInterfaceOn: true })).toEqual([
      "Entities",
      "Nets",
      "Components",
    ]);
  });

  it("shows the Components panel alone in an editor that only composes", () => {
    expect(
      titles({ composesOnly: true, compositionInterfaceOn: true }),
    ).toEqual(["Components"]);
  });

  it("has no Components panel where the host offers no library", () => {
    expect(
      titles({ compositionInterfaceOn: true, offersLibraries: false }),
    ).toEqual(["Entities", "Nets"]);
  });
});
