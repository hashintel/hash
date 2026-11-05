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
        firstVersion: 1,
        lastVersion: 1,
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
      pills: [{ version: 1, x: 0, gap: false }],
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
        firstVersion: 2,
        lastVersion: 7,
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

  it("centres the type's versions under the parent's, and shows parent versions the type skips", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: false,
        firstVersion: 1,
        lastVersion: 2,
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

    expect(layout.width).toBe(86);
    expect(layout.parentLabelX).toBe(0);
    expect(layout.labelX).toBe(15);
    expect(layout.parentPills).toEqual([
      { version: 1, x: 0 },
      { version: 2, x: 30 },
      { version: 3, x: 60 },
    ]);
    expect(layout.pills).toEqual([
      { version: 1, x: 15, gap: false },
      { version: 2, x: 45, gap: false },
    ]);
    expect(layout.lines).toEqual([
      { version: 1, parentVersion: 1, path: "M 28 72 C 28 48 13 48 13 24" },
      { version: 2, parentVersion: 3, path: "M 58 72 C 58 48 73 48 73 24" },
    ]);
    expect(layout.parentMoreX).toBeNull();
  });

  describe("for a former type with a gap and a version that extends two parent versions", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: true,
        firstVersion: 1,
        lastVersion: 4,
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

    it("draws a dotted pill for the version that extends no parent version", () => {
      expect(layout.pills).toEqual([
        { version: 1, x: 0, gap: false },
        { version: 2, x: 30, gap: false },
        { version: 3, x: 60, gap: true },
        { version: 4, x: 90, gap: false },
      ]);
    });

    it("spreads the lines that leave one version, and the lines that reach one parent version", () => {
      expect(layout.lines).toEqual([
        { version: 1, parentVersion: 1, path: "M 13 72 C 13 48 35 48 35 24" },
        { version: 2, parentVersion: 1, path: "M 39 72 C 39 48 51 48 51 24" },
        { version: 2, parentVersion: 2, path: "M 47 72 C 47 48 65 48 65 24" },
        {
          version: 4,
          parentVersion: 2,
          path: "M 103 72 C 103 48 81 48 81 24",
        },
      ]);
    });

    it("puts an ellipsis after the parent's versions and after the type's, and makes room for them", () => {
      expect(layout.parentPills).toEqual([
        { version: 1, x: 30 },
        { version: 2, x: 60 },
      ]);
      expect(layout.parentMoreX).toBe(88);
      expect(layout.moreX).toBe(118);
      expect(layout.width).toBe(134);
    });

    it("summarises every version for screen readers", () => {
      expect(layout.summary).toBe(
        "Shell Company: v1 extends Company v1; v2 extends Company v1 and v2; v3 doesn't extend Company, or is archived; v4 extends Company v2. Company has versions newer than v2. Its newer versions don't extend Company, or are archived.",
      );
    });
  });

  it("lists a version's parent versions in order when it starts extending an older parent version later", () => {
    const layout = getVersionGraphLayout({
      row: {
        former: false,
        firstVersion: 1,
        lastVersion: 2,
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
