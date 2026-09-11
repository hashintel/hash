import { describe, expect, it } from "vitest";

import { DiagnosticSeverity } from "@hashintel/petrinaut-core";

import { getConstraintDocumentUri } from "../../../../../../../monaco/editor-paths";
import {
  type ConstraintDraft,
  describeConstraint,
  getConstraintErrorMessage,
  summarizeConstraintLspErrors,
} from "./constraint-lsp";

const range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 1 },
};

const drafts: ConstraintDraft[] = [
  { id: "param-1", space: "parameters", code: "scenario.a < 1" },
  { id: "state-1", space: "state", code: "" },
  { id: "param-2", space: "parameters", code: "scenario.b < 1" },
  { id: "state-2", space: "state", code: "return 1;" },
];

describe("describeConstraint", () => {
  it("names rows one-based within their space across the mixed list", () => {
    expect(describeConstraint(drafts[0]!, drafts)).toBe(
      "Parameter constraint 1",
    );
    expect(describeConstraint(drafts[2]!, drafts)).toBe(
      "Parameter constraint 2",
    );
    expect(describeConstraint(drafts[1]!, drafts)).toBe("State constraint 1");
    expect(describeConstraint(drafts[3]!, drafts)).toBe("State constraint 2");
  });

  it("counts a draft the list does not hold after its space's last row", () => {
    expect(
      describeConstraint({ id: "new", space: "state", code: "" }, drafts),
    ).toBe("State constraint 3");
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
      getConstraintDocumentUri("state-1"),
      [{ range, message: "empty body", severity: DiagnosticSeverity.Error }],
    ],
    [
      getConstraintDocumentUri("other-drawer"),
      [{ range, message: "elsewhere", severity: DiagnosticSeverity.Error }],
    ],
  ]);

  it("reports the first failing non-blank row with its name, in list order", () => {
    // `state-1` is blank: its diagnostic is skipped, as the row is at submission.
    expect(summarizeConstraintLspErrors(diagnosticsByUri, drafts)).toBe(
      "State constraint 2: not boolean",
    );
  });

  it("ignores sessions that belong to other drafts", () => {
    expect(
      summarizeConstraintLspErrors(diagnosticsByUri, [drafts[0]!, drafts[2]!]),
    ).toBe(null);
  });
});
