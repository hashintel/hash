import { describe, expect, it } from "vitest";

import { getAdHocDocumentUri } from "@hashintel/petrinaut-core";

import { summarizeAdHocLspErrors } from "./ad-hoc-lsp-errors";

describe("summarizeAdHocLspErrors", () => {
  it("counts only this session's documents and reports the first message", () => {
    const diagnostics = new Map([
      [
        getAdHocDocumentUri("session-a", "slot-1"),
        [{ message: "first" }, { message: "second" }],
      ],
      [getAdHocDocumentUri("session-a", "slot-2"), [{ message: "third" }]],
      [getAdHocDocumentUri("session-b", "slot-1"), [{ message: "other form" }]],
      [
        "inmemory://sdcpn/_temp/scenarios/session-a/initial-state-code.ts",
        [{ message: "classic editor" }],
      ],
    ]);

    expect(summarizeAdHocLspErrors(diagnostics, "session-a")).toEqual({
      count: 3,
      firstMessage: "first",
    });
  });

  it("skips documents without diagnostics", () => {
    const diagnostics = new Map([
      [getAdHocDocumentUri("session-a", "slot-1"), []],
      [getAdHocDocumentUri("session-a", "slot-2"), [{ message: "late" }]],
    ]);

    expect(summarizeAdHocLspErrors(diagnostics, "session-a")).toEqual({
      count: 1,
      firstMessage: "late",
    });
    expect(summarizeAdHocLspErrors(new Map(), "session-a")).toEqual({
      count: 0,
      firstMessage: undefined,
    });
  });
});
