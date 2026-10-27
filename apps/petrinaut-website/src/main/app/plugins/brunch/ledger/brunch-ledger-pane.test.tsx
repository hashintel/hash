/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { foldBrunchLedgerHistory } from "./brunch-ledger-history";
import { BrunchLedgerPane } from "./brunch-ledger-pane";

import type { LedgerHistoryMessage } from "@hashintel/brunch-agent";

// jsdom does not implement scrolling.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

afterEach(cleanup);

const reservoir = [
  "entity/create",
  {
    name: "Hillcrest service reservoir",
    kind: "resource",
    origin: "stated",
    status: "confirmed",
  },
];

const commit = (
  toolCallId: string,
  overrides: Record<string, unknown> = {},
  entries: unknown[] = [reservoir],
  ids: string[] = ["e1"],
) => ({
  type: "dynamic-tool",
  toolName: "ledger_commit",
  toolCallId,
  state: "output-available",
  input: { entries },
  output: {
    status: "recorded",
    commitId: toolCallId,
    revision: 1,
    ids,
  },
  ...overrides,
});

const assistant = (...parts: unknown[]): LedgerHistoryMessage => ({
  id: "assistant",
  role: "assistant",
  purpose: "assistant",
  parts,
});

const user = (id: string, text: string): LedgerHistoryMessage => ({
  id,
  role: "user",
  purpose: "user",
  parts: [{ type: "text", text }],
});

/** One turn whose commit records the reservoir, a claim about it and a reflection naming the Reservoir place. */
const reflected = [
  user("user-1", "The reservoir holds a day of supply."),
  assistant(
    commit(
      "ledger-1",
      {},
      [
        reservoir,
        [
          "claim/create",
          {
            text: "The reservoir holds a day of supply.",
            entities: ["$0"],
            origin: "stated",
            status: "confirmed",
          },
        ],
        [
          "reflection/create",
          {
            text: "The Reservoir place stands in for the stored volume.",
            netElements: [{ kind: "place", id: "reservoir" }],
            claims: ["$1"],
          },
        ],
      ],
      ["e1", "c1", "r1"],
    ),
  ),
];

const reservoirPlace = {
  type: "place",
  id: toPetrinautId("reservoir"),
} as const;

test("renders accepted commits as a document whose records carry their addresses, not as visible IDs", () => {
  render(<BrunchLedgerPane messages={[assistant(commit("c1"))]} />);
  const document = screen.getByTestId("brunch-ledger-document");
  expect(document.textContent).toContain("Hillcrest service reservoir");
  expect(document.textContent).not.toContain("e1");
  expect(document.querySelector('[data-ledger-address="e1"]')).not.toBeNull();
});

test("never shows refused, failed, pending or unbound commits", () => {
  for (const part of [
    commit("refused", {
      output: {
        status: "refused",
        applied: false,
        code: "unknown-address",
        message: "No such record.",
        revision: 0,
      },
    }),
    commit("failed", { state: "output-error", output: undefined }),
    commit("pending", { state: "input-available", output: undefined }),
    commit("unbound", {
      output: {
        status: "recorded",
        commitId: "another-call",
        revision: 1,
        ids: ["e1"],
      },
    }),
  ]) {
    const { container, unmount } = render(
      <BrunchLedgerPane messages={[assistant(part)]} />,
    );
    expect(container.textContent).toContain(
      "Nothing is recorded in the Ledger yet.",
    );
    expect(container.textContent).not.toContain("Hillcrest service reservoir");
    unmount();
  }
});

test("counts accepted commits as activity, not net changes or reads", () => {
  const settledChange = {
    type: "dynamic-tool",
    toolName: "addPlace",
    toolCallId: "canonical-call",
    state: "output-available",
    input: { id: "queue" },
    output: {
      brunchBrowserResult: true,
      output: { applied: true },
      metadata: { documentRevision: { before: "one", after: "two" } },
    },
  };
  const unchangedRead = {
    ...settledChange,
    toolName: "getLatestNetDefinition",
    toolCallId: "read-call",
    output: {
      brunchBrowserResult: true,
      output: {},
      metadata: { documentRevision: { before: "two" } },
    },
  };
  expect(
    foldBrunchLedgerHistory([
      assistant(commit("c1"), settledChange, unchangedRead),
    ]).activityIdentities,
  ).toEqual(["c1"]);
});

test("explains a selected net element from the reflection naming it, and marks the records behind it", () => {
  render(
    <BrunchLedgerPane messages={reflected} selection={[reservoirPlace]} />,
  );
  const basis = screen.getByRole("complementary", {
    name: "Basis of the selection",
  });
  expect(basis.textContent).toContain(
    "The Reservoir place stands in for the stored volume.",
  );
  expect(basis.textContent).toContain("The reservoir holds a day of supply.");
  expect(basis.textContent).toContain("“The reservoir holds a day of supply.”");
  const document = screen.getByTestId("brunch-ledger-document");
  expect(document.hasAttribute("data-tracing")).toBe(true);
  expect(scrollIntoView).toHaveBeenCalled();
  for (const address of ["e1", "c1"])
    expect(
      document
        .querySelector(`[data-ledger-address="${address}"]`)
        ?.hasAttribute("data-traced"),
    ).toBe(true);
});

test("says no reasoning was recorded for a selected element no reflection names", () => {
  render(
    <BrunchLedgerPane
      messages={reflected}
      selection={[{ type: "place", id: toPetrinautId("elsewhere") }]}
    />,
  );
  expect(
    screen.getByRole("complementary", { name: "Basis of the selection" })
      .textContent,
  ).toContain("Brunch recorded no reasoning for the selected net elements.");
  expect(
    screen.getByTestId("brunch-ledger-document").querySelector("[data-traced]"),
  ).toBeNull();
});

test("shows reflections under their entities only when switched on, and selects their net elements", async () => {
  const onSelectNetElements = vi.fn();
  render(
    <BrunchLedgerPane
      messages={reflected}
      onSelectNetElements={onSelectNetElements}
    />,
  );
  const document = screen.getByTestId("brunch-ledger-document");
  expect(document.querySelector('[data-ledger-address="r1"]')).toBeNull();

  fireEvent.click(
    screen.getByRole("checkbox", { name: "Show Brunch’s reflections" }),
  );
  await waitFor(() =>
    expect(document.querySelector('[data-ledger-address="r1"]')).not.toBeNull(),
  );

  fireEvent.click(screen.getByRole("button", { name: "Show in net" }));
  expect(onSelectNetElements).toHaveBeenCalledWith([reservoirPlace]);
});
