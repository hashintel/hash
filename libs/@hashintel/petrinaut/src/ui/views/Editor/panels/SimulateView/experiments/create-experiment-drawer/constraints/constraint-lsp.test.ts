import { describe, expect, it } from "vitest";

import { DiagnosticSeverity } from "@hashintel/petrinaut-core";

import { getConstraintDocumentUri } from "../../../../../../../monaco/editor-paths";
import {
  describeConstraint,
  getConstraintErrorMessage,
  summarizeConstraintLspErrors,
} from "./constraint-lsp";

const range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 1 },
};

describe("describeConstraint", () => {
  it("names rows one-based per space", () => {
    expect(describeConstraint("parameters", 0)).toBe("Parameter constraint 1");
    expect(describeConstraint("state", 2)).toBe("State constraint 3");
  });
});

describe("getConstraintErrorMessage", () => {
  it("returns the first error and skips warnings", () => {
    const diagnosticsByUri = new Map([
      [
        getConstraintDocumentUri("draft-a"),
        [
          { range, message: "lint", severity: DiagnosticSeverity.Warning },
          { range, message: "bad type", severity: DiagnosticSeverity.Error },
          { range, message: "second", severity: DiagnosticSeverity.Error },
        ],
      ],
    ]);
    expect(getConstraintErrorMessage(diagnosticsByUri, "draft-a")).toBe(
      "bad type",
    );
    expect(getConstraintErrorMessage(diagnosticsByUri, "draft-b")).toBe(
      undefined,
    );
  });
});

describe("summarizeConstraintLspErrors", () => {
  const diagnosticsByUri = new Map([
    [
      getConstraintDocumentUri("state-2"),
      [{ range, message: "not boolean", severity: DiagnosticSeverity.Error }],
    ],
    [
      getConstraintDocumentUri("other-drawer"),
      [{ range, message: "elsewhere", severity: DiagnosticSeverity.Error }],
    ],
  ]);

  it("reports the first failing row with its name, in group order", () => {
    expect(
      summarizeConstraintLspErrors(diagnosticsByUri, [
        { space: "parameters", drafts: [{ id: "param-1", code: "" }] },
        {
          space: "state",
          drafts: [
            { id: "state-1", code: "" },
            { id: "state-2", code: "return 1;" },
          ],
        },
      ]),
    ).toBe("State constraint 2: not boolean");
  });

  it("ignores sessions that belong to other drafts", () => {
    expect(
      summarizeConstraintLspErrors(diagnosticsByUri, [
        { space: "parameters", drafts: [{ id: "param-1", code: "" }] },
      ]),
    ).toBe(null);
  });
});
