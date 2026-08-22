/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AdHocScenarioForm } from "./ad-hoc-scenario-form";
import { EMPTY_AD_HOC_STATE } from "./state";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

// jsdom provides neither observer, but the value editor's popover schedules
// @floating-ui/dom's autoUpdate on an animation frame, which constructs both.
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

const context: AdHocSynthesisContext = {
  netParameters: [
    {
      id: "param-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  places: [
    {
      id: "place-pumps",
      name: "Pumps",
      colorId: "colour-pump",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  types: [
    {
      id: "colour-pump",
      name: "Pump",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [
        { elementId: "e1", name: "pressure", type: "real" },
        { elementId: "e2", name: "worn", type: "boolean" },
      ],
    },
  ],
};

const Harness: React.FC<{
  optimizable: boolean;
  onState?: (state: AdHocScenarioState) => void;
  initial?: AdHocScenarioState;
}> = ({ optimizable, onState, initial = EMPTY_AD_HOC_STATE }) => {
  const [state, setState] = useState(initial);
  return (
    <AdHocScenarioForm
      state={state}
      onChange={(next) => {
        setState(next);
        onState?.(next);
      }}
      context={context}
      optimizable={optimizable}
    />
  );
};

describe("AdHocScenarioForm", () => {
  it("adds fixed and template rows to a coloured place", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        optimizable
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add template" }));

    const place = latest?.places["place-pumps"];
    if (place?.kind !== "coloured") {
      throw new Error("expected a coloured place state");
    }
    expect(place.rows.map((row) => row.kind)).toEqual(["fixed", "template"]);
    // The template gained a count strip and the fixed row shows its ordinal.
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("i")).toBeTruthy();
  });

  it("shares a column, seeding from the first row, and un-shares it back", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        optimizable
        onState={(state) => {
          latest = state;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));

    const header = screen.getByRole("button", {
      name: "Share column pressure",
    });
    fireEvent.click(header);

    const place = latest?.places["place-pumps"];
    if (place?.kind !== "coloured") {
      throw new Error("expected a coloured place state");
    }
    expect(place.sharedColumns["pressure"]?.expression).toBe("0");
    expect(header.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(header);
    const after = latest?.places["place-pumps"];
    if (after?.kind !== "coloured") {
      throw new Error("expected a coloured place state");
    }
    expect(after.sharedColumns["pressure"]).toBeUndefined();
    expect(after.retainedSharedColumns?.["pressure"]).toBeTruthy();
  });

  it("hides every Optimize control when optimizable is off", () => {
    render(<Harness optimizable={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect(screen.queryByText("Optimize")).toBeNull();
    expect(screen.queryByRole("switch", { name: /Optimize/ })).toBeNull();
  });

  it("keeps the uncoloured count as an expression slot", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        optimizable
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Token count of Queue" }),
    );
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "parameters.rate * 4" } });

    const place = latest?.places["place-queue"];
    if (place?.kind !== "uncoloured") {
      throw new Error("expected an uncoloured place state");
    }
    expect(place.count.expression).toBe("parameters.rate * 4");
  });
});
