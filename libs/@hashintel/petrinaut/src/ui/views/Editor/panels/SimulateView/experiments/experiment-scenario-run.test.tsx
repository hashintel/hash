/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { lowerScenarioToHir } from "@hashintel/petrinaut-core/hir";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../react/lsp/context";
import { ExperimentScenarioRun } from "./experiment-scenario-run";

import type {
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

// Monaco cannot run in jsdom; the expression editor becomes a plain textarea.
vi.mock("../../../../../monaco/code-editor", () => ({
  CodeEditor: ({ value }: { value?: string }) => (
    <textarea aria-label="Expression" defaultValue={value ?? ""} />
  ),
}));

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): never[] {
    return [];
  }
}
globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver =
  ObserverStub as unknown as typeof IntersectionObserver;

afterEach(cleanup);

const place = (index: number) => ({
  id: `place-${index}`,
  name: `Place ${index}`,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const context: AdHocSynthesisContext = {
  netParameters: [],
  places: [place(1), place(2), place(3)],
  types: [],
};

const scenario: Scenario = {
  id: "scenario-1",
  name: "Baseline",
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: {
    type: "per_place",
    content: { "place-1": "1", "place-2": "2", "place-3": "3" },
  },
};

// The preview only materializes from a lowered scenario, so the stand-in
// client lowers with the real compiler instead of the stub's empty HIR.
const languageClient = {
  ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  requestScenarioHir: (input: Parameters<typeof lowerScenarioToHir>[0]) =>
    Promise.resolve(lowerScenarioToHir(input)),
};

describe("ExperimentScenarioRun", () => {
  it("renders the computed initial state in a bounded scroll region", async () => {
    render(
      <LanguageClientContext value={languageClient}>
        <ExperimentScenarioRun
          scenario={scenario}
          context={context}
          values={{}}
          onValuesChange={() => {}}
        />
      </LanguageClientContext>,
    );

    // The preview materializes only once its sub-section is opened.
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle Computed state section" }),
    );

    const title = await waitFor(() => screen.getByText("Initial state"));
    const region = title.closest<HTMLElement>('[class*="max-h_"]');

    // A net with many places — or one coloured place with many token rows —
    // would otherwise push Metrics and the drawer's footer out of view.
    expect(region).not.toBeNull();
    expect(region!.className).toContain("ov-y_auto");
    expect(region!.className).toMatch(/max-h_\[\d+px\]/);
    // Parameters and initial state scroll together inside it, and it reads as
    // a panel rather than more form.
    expect(region!.textContent).toContain("Parameters");
    expect(region!.querySelector("[aria-label='Place 1 › count']")).not.toBe(
      null,
    );
    expect(region!.className).toContain("bg-c_neutral.s20");
    expect(region!.className).toContain("bd-c_neutral.bd.subtle");
  });
});
