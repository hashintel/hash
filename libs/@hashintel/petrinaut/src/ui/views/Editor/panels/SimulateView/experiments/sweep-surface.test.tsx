/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExperimentsActionsContext } from "../../../../../../react/experiments/context";
import { makeParameterSweepExperiment } from "./experiments-story-fixtures";
import { SweepSurface } from "./sweep-surface";

import type {
  ExperimentRecord,
  ExperimentsActionsValue,
} from "../../../../../../react/experiments/context";
import type { ContourSurfaceFraction } from "../../../../../components/contour-surface";
import type { ReactNode } from "react";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const Select = ({
    items,
    onChange,
    value,
    disabled,
    "aria-label": ariaLabel,
  }: {
    items: readonly { value: string; text: string }[];
    onChange: (value: string | null) => void;
    value: string | null;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.text}
        </option>
      ))}
    </select>
  );
  return { ...actual, Select };
});

// The contour draws on a canvas jsdom cannot host; this one picks the plot's
// centre-top when clicked, when the surface lets it pick at all.
vi.mock("../../../../../components/contour-surface", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../../components/contour-surface")
    >();
  const ContourSurface = ({
    onPickFraction,
    readOnly = false,
    "aria-label": ariaLabel,
  }: {
    onPickFraction?: (fraction: ContourSurfaceFraction) => void;
    readOnly?: boolean;
    "aria-label"?: string;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-disabled={readOnly || undefined}
      data-interactive={onPickFraction ? "" : undefined}
      onClick={() => onPickFraction?.({ x: 0.5, y: 1 })}
    />
  );
  return { ...actual, ContourSurface };
});

afterEach(cleanup);

const twoAxes = makeParameterSweepExperiment();

/** The sweep with a third parameter the plot does not show, left as a range. */
const threeAxes: ExperimentRecord = {
  ...twoAxes,
  parameterAxes: [
    ...twoAxes.parameterAxes,
    {
      identifier: "initial_infected",
      min: 1,
      max: 20,
      stepCount: 19,
      integer: true,
    },
  ],
  sweep: {
    ...twoAxes.sweep!,
    selection: {
      ...twoAxes.sweep!.selection,
      initial_infected: { from: 0, to: 19 },
    },
  },
};

const WithActions = ({
  setSweepSelection,
  children,
}: {
  setSweepSelection: ExperimentsActionsValue["setSweepSelection"];
  children: ReactNode;
}) => {
  const actions = use(ExperimentsActionsContext);
  return (
    <ExperimentsActionsContext value={{ ...actions, setSweepSelection }}>
      {children}
    </ExperimentsActionsContext>
  );
};

const renderSurface = (
  experiment: ExperimentRecord,
  { following = false, disabled = false } = {},
) => {
  const setSweepSelection =
    vi.fn<ExperimentsActionsValue["setSweepSelection"]>();
  render(
    <WithActions setSweepSelection={setSweepSelection}>
      <SweepSurface
        experiment={experiment}
        following={following}
        disabled={disabled}
      />
    </WithActions>,
  );
  return setSweepSelection;
};

describe("SweepSurface picks", () => {
  it("collapses every axis to a point: the shown ones at the pick, the hidden one at the middle of its range", () => {
    const setSweepSelection = renderSurface(threeAxes);

    fireEvent.click(screen.getByRole("button", { name: "Sweep surface" }));

    // transmission_rate has 50 positions, recovery_days 18, so the plot's
    // centre-top is 25 and 18; the hidden range 0..19 rounds to 10.
    expect(setSweepSelection).toHaveBeenCalledWith(threeAxes.id, {
      transmission_rate: { from: 25, to: 25 },
      recovery_days: { from: 18, to: 18 },
      initial_infected: { from: 10, to: 10 },
    });
  });

  it("only displays while an optimizer drives the sweep", () => {
    const setSweepSelection = renderSurface(twoAxes, { following: true });
    const plot = screen.getByRole("button", { name: "Sweep surface" });

    expect(plot.dataset.interactive).toBeUndefined();
    fireEvent.click(plot);
    expect(setSweepSelection).not.toHaveBeenCalled();
  });

  it("locks the pickers and marks the card read-only while an optimizer drives the sweep", () => {
    renderSurface(twoAxes, { following: true });

    for (const name of [
      "Surface X parameter",
      "Surface Y parameter",
      "Surface metric",
    ]) {
      expect(
        (screen.getByRole("combobox", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
    const mark = document.querySelector("[data-surface-read-only]");
    expect(mark?.getAttribute("data-surface-read-only")).toBe("following");
    expect(mark?.textContent).toContain("Read-only");
    expect(
      screen
        .getByRole("button", { name: "Sweep surface" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("keeps the pickers live and shows no mark while the user drives the sweep", () => {
    renderSurface(twoAxes);

    expect(
      (
        screen.getByRole("combobox", {
          name: "Surface metric",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(document.querySelector("[data-surface-read-only]")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Sweep surface" })
        .getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("only displays once the sweep is cancelled", () => {
    const setSweepSelection = renderSurface(twoAxes, { disabled: true });
    const plot = screen.getByRole("button", { name: "Sweep surface" });

    expect(plot.dataset.interactive).toBeUndefined();
    fireEvent.click(plot);
    expect(setSweepSelection).not.toHaveBeenCalled();
    expect(
      document
        .querySelector("[data-surface-read-only]")
        ?.getAttribute("data-surface-read-only"),
    ).toBe("disabled");
  });
});
