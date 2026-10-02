/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { VoiceInputProvenance } from "./voice-input-provenance";

afterEach(cleanup);

test.each<{
  state: "streaming" | "done";
  preparationFailed?: boolean;
  fields: Record<string, string>;
  label: string;
  note: string;
}>([
  {
    state: "streaming" as const,
    fields: {},
    label: "Preparing for Brunch",
    note: "Preparing from what you said",
  },
  {
    state: "streaming" as const,
    fields: { goal: "Compare staffing" },
    label: "Sending to Brunch",
    note: "Prepared from what you said",
  },
  {
    state: "done" as const,
    fields: { goal: "Compare staffing" },
    label: "Sent to Brunch",
    note: "Prepared from what you said",
  },
  {
    state: "streaming" as const,
    preparationFailed: true,
    fields: {},
    label: "Sending without preparation",
    note: "Preparation failed; sending your original words",
  },
  {
    state: "done" as const,
    preparationFailed: true,
    fields: {},
    label: "Sent without preparation",
    note: "Preparation failed; your original words were sent",
  },
])(
  "labels a brief truthfully: $label",
  ({ state, fields, preparationFailed, label, note }) => {
    render(
      <VoiceInputProvenance brief={{ state, fields, preparationFailed }} />,
    );
    const disclosure = screen.getByText(label).closest("details");
    expect(disclosure?.getAttribute("aria-busy")).toBe(
      String(state === "streaming"),
    );
    expect(screen.getByText(note)).not.toBeNull();
  },
);

test("renders absent brief fields as placeholders without confusing verbatim Still open", () => {
  render(
    <VoiceInputProvenance
      brief={{
        state: "done",
        fields: { runs: "Still open", stillOpen: "constraints, ask" },
      }}
    />,
  );

  expect(screen.getByText("runs").nextSibling?.textContent).toBe("Still open");
  expect(screen.getByText("constraints").nextSibling?.textContent).toBe(
    "Still open",
  );
  expect(screen.getByText("ask").nextSibling?.textContent).toBe("Still open");
  expect(screen.queryByText("still Open")).toBeNull();
});
