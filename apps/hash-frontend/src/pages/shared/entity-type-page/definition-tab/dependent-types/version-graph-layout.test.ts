import { describe, expect, it } from "vitest";

import {
  getVersionGraphLayout,
  getVersionGraphTooltipMaxWidth,
} from "./version-graph-layout";

describe("getVersionGraphLayout", () => {
  it("draws one version that extends one parent version, and widens the graph to fit the longer title", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: false,
        parentVersions: [1],
        ranges: [{ firstVersion: 1, lastVersion: 1, parentVersion: 1 }],
      },
      title: "Machine",
      parentTitle: "Actor",
      parentLatestVersion: 1,
    });

    expect(layout).toEqual({
      width: 51,
      parentLabelX: 0,
      labelX: 0,
      parentPills: [{ version: 1, x: 0 }],
      pills: [{ version: 1, x: 0 }],
      lines: [
        { version: 1, parentVersion: 1, path: "M 13 72 C 13 48 13 48 13 24" },
      ],
      parentMoreX: null,
      moreX: null,
      summary: "Machine: v1 extends Actor v1.",
    });
  });

  it("centres the parent's versions over the type's when the type has more", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: false,
        parentVersions: [1, 2],
        ranges: [
          { firstVersion: 2, lastVersion: 3, parentVersion: 1 },
          { firstVersion: 4, lastVersion: 7, parentVersion: 2 },
        ],
      },
      title: "User",
      parentTitle: "Actor",
      parentLatestVersion: 2,
    });

    expect(layout.width).toBe(176);
    expect(layout.parentLabelX).toBe(60);
    expect(layout.labelX).toBe(0);
    expect(layout.parentPills).toEqual([
      { version: 1, x: 60 },
      { version: 2, x: 90 },
    ]);
    expect(layout.pills.map(({ x }) => x)).toEqual([0, 30, 60, 90, 120, 150]);
    expect(layout.lines.slice(0, 2)).toEqual([
      { version: 2, parentVersion: 1, path: "M 13 72 C 13 48 65 48 65 24" },
      { version: 3, parentVersion: 1, path: "M 43 72 C 43 48 81 48 81 24" },
    ]);
  });

  it("draws only the parent versions that a version extends, side by side", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: false,
        parentVersions: [1, 3],
        ranges: [
          { firstVersion: 1, lastVersion: 1, parentVersion: 1 },
          { firstVersion: 2, lastVersion: 2, parentVersion: 3 },
        ],
      },
      title: "Robot",
      parentTitle: "Actor",
      parentLatestVersion: 3,
    });

    expect(layout.width).toBe(56);
    expect(layout.parentLabelX).toBe(0);
    expect(layout.labelX).toBe(0);
    expect(layout.parentPills).toEqual([
      { version: 1, x: 0 },
      { version: 3, x: 30 },
    ]);
    expect(layout.pills).toEqual([
      { version: 1, x: 0 },
      { version: 2, x: 30 },
    ]);
    expect(layout.lines).toEqual([
      { version: 1, parentVersion: 1, path: "M 13 72 C 13 48 13 48 13 24" },
      { version: 2, parentVersion: 3, path: "M 43 72 C 43 48 43 48 43 24" },
    ]);
    expect(layout.parentMoreX).toBeNull();
  });

  it("draws one pill per version and parent version, however far apart their numbers are", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: false,
        parentVersions: [1, 4_000_000_000],
        ranges: [
          { firstVersion: 1, lastVersion: 1, parentVersion: 1 },
          {
            firstVersion: 4_000_000_000,
            lastVersion: 4_000_000_000,
            parentVersion: 4_000_000_000,
          },
        ],
      },
      title: "Robot",
      parentTitle: "Actor",
      parentLatestVersion: 4_000_000_000,
    });

    expect(layout.parentPills).toEqual([
      { version: 1, x: 0 },
      { version: 4_000_000_000, x: 30 },
    ]);
    expect(layout.pills).toEqual([
      { version: 1, x: 0 },
      { version: 4_000_000_000, x: 30 },
    ]);
  });

  describe("for a former type with a missing version and a version that extends two parent versions", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: true,
        parentVersions: [1, 2],
        ranges: [
          { firstVersion: 1, lastVersion: 2, parentVersion: 1 },
          { firstVersion: 2, lastVersion: 2, parentVersion: 2 },
          { firstVersion: 4, lastVersion: 4, parentVersion: 2 },
        ],
      },
      title: "Shell Company",
      parentTitle: "Company",
      parentLatestVersion: 3,
    });

    it("draws no pill for the missing version, so the versions around it sit side by side", () => {
      expect(layout.pills).toEqual([
        { version: 1, x: 0 },
        { version: 2, x: 30 },
        { version: 4, x: 60 },
      ]);
    });

    it("spreads the lines that leave one version, and the lines that reach one parent version", () => {
      expect(layout.lines).toEqual([
        { version: 1, parentVersion: 1, path: "M 13 72 C 13 48 20 48 20 24" },
        { version: 2, parentVersion: 1, path: "M 39 72 C 39 48 36 48 36 24" },
        { version: 2, parentVersion: 2, path: "M 47 72 C 47 48 50 48 50 24" },
        { version: 4, parentVersion: 2, path: "M 73 72 C 73 48 66 48 66 24" },
      ]);
    });

    it("puts an ellipsis after the parent's versions and after the type's, and makes room for them", () => {
      expect(layout.parentPills).toEqual([
        { version: 1, x: 15 },
        { version: 2, x: 45 },
      ]);
      expect(layout.parentMoreX).toBe(73);
      expect(layout.moreX).toBe(88);
      expect(layout.width).toBe(104);
    });

    it("summarises every version for screen readers", () => {
      expect(layout.summary).toBe(
        "Shell Company: v1 extends Company v1; v2 extends Company v1 and v2; v4 extends Company v2. Company has versions newer than v2. Its newer versions don't extend Company, or are archived.",
      );
    });
  });

  it("lists a version's parent versions in order when it starts extending an older parent version later", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: false,
        parentVersions: [1, 2],
        ranges: [
          { firstVersion: 1, lastVersion: 2, parentVersion: 2 },
          { firstVersion: 2, lastVersion: 2, parentVersion: 1 },
        ],
      },
      title: "Robot",
      parentTitle: "Actor",
      parentLatestVersion: 2,
    });

    expect(layout.summary).toBe(
      "Robot: v1 extends Actor v2; v2 extends Actor v1 and v2.",
    );
  });
});

describe("getVersionGraphTooltipMaxWidth", () => {
  it("is 640 px on a wide row", () => {
    expect(getVersionGraphTooltipMaxWidth(1000)).toBe(640);
  });

  it("leaves 80 px of a narrow row uncovered", () => {
    expect(getVersionGraphTooltipMaxWidth(600)).toBe(520);
  });
});
