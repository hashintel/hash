/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { describeStudyProgress } from "../../shared/describe-study-progress";
import { formatNumber } from "../../shared/format-value";
import {
  makeConnectedStudyState,
  makeOptimizationInput,
  makeOptimizationRecord,
  makeTrials,
  optimizedBindingSets,
} from "../study-fixtures";
import { StudyHeader } from "./study-header";

import type { PetrinautOptimizationTrialEvent } from "@hashintel/petrinaut-core";

afterEach(cleanup);

const input = makeOptimizationInput(optimizedBindingSets.base);
const { trials } = makeTrials(input, 12);

/** Trials whose objectives are given, so the verdict is chosen by the test. */
const trialsWithObjectives = (
  objectives: readonly number[],
): PetrinautOptimizationTrialEvent[] =>
  objectives.map((objective, index) => ({
    ...trials[0]!,
    trial: index,
    objective,
    state: "complete",
    best: null,
    seq: index + 2,
  }));

const verdictOf = () =>
  document.querySelector<HTMLElement>("[data-verdict]")?.dataset.verdict ??
  null;

describe("describeStudyProgress", () => {
  it("names the step in flight and the best step so far while running", () => {
    expect(
      describeStudyProgress(
        makeOptimizationRecord({
          input,
          trials: trials.slice(0, 4),
          best: { trial: 2, parameters: {}, objective: 650.5 },
          status: "running",
        }),
      ),
    ).toBe(`Step 5 of 30 · best step so far: step 3 (${formatNumber(650.5)})`);
  });

  it("says how the study ended once settled, and who stopped it", () => {
    const settled = {
      input,
      trials: trials.slice(0, 4),
      best: { trial: 2, parameters: {}, objective: 650.5 },
    };
    expect(
      describeStudyProgress(
        makeOptimizationRecord({
          ...settled,
          status: "cancelled",
          connected: makeConnectedStudyState(input),
        }),
      ),
    ).toBe(
      `Stopped after 4 of 30 steps · best step so far: step 3 (${formatNumber(650.5)})`,
    );
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ ...settled, status: "cancelled" }),
      ),
    ).toBe(
      `Cancelled after 4 of 30 steps · best step so far: step 3 (${formatNumber(650.5)})`,
    );
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ ...settled, status: "error" }),
      ),
    ).toBe(
      `Failed after 4 of 30 steps · best step so far: step 3 (${formatNumber(650.5)})`,
    );
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ ...settled, trials, status: "complete" }),
      ),
    ).toBe(
      `Finished 12 of 30 steps · best step so far: step 3 (${formatNumber(650.5)})`,
    );
  });

  it("says a paused study is paused, and how many steps are still finishing", () => {
    const paused = {
      input,
      trials: trials.slice(0, 4),
      best: { trial: 2, parameters: {}, objective: 650.5 },
      status: "paused" as const,
    };
    expect(
      describeStudyProgress(
        makeOptimizationRecord({
          ...paused,
          connected: makeConnectedStudyState(input),
        }),
      ),
    ).toBe(
      `Paused at 4 of 30 steps · best step so far: step 3 (${formatNumber(650.5)})`,
    );
    expect(
      describeStudyProgress(
        makeOptimizationRecord({
          ...paused,
          connected: makeConnectedStudyState(input, {
            inFlight: [
              { trial: 4, parameters: {}, objective: null },
              { trial: 5, parameters: {}, objective: null },
            ],
          }),
        }),
      ),
    ).toBe(
      `Paused at 4 of 30 steps · 2 steps finishing · best step so far: step 3 (${formatNumber(650.5)})`,
    );
  });

  it("admits there is no best step yet", () => {
    expect(
      describeStudyProgress(
        makeOptimizationRecord({ input, status: "initializing" }),
      ),
    ).toBe("Starting · no best step yet");
  });
});

describe("StudyHeader", () => {
  it("shows the verdict chip only while the study runs", () => {
    const running = makeOptimizationRecord({
      input,
      trials: trialsWithObjectives([1, 2, 3, 4, 5, 6, 7]),
      best: { trial: 6, parameters: {}, objective: 7 },
      status: "running",
    });
    const { unmount } = render(<StudyHeader optimization={running} />);
    expect(screen.getByText(/best step so far/u)).toBeTruthy();
    expect(screen.getByText(/Still improving/u)).toBeTruthy();
    expect(verdictOf()).toBe("improving");
    unmount();

    render(<StudyHeader optimization={{ ...running, status: "complete" }} />);
    expect(verdictOf()).toBeNull();
    expect(screen.queryByText(/Still improving/u)).toBeNull();
    expect(screen.getByText(/^Finished 7 of 30 steps/u)).toBeTruthy();
  });

  it("says Converging once a window passed without a better step, and Too early before one window", () => {
    const { unmount } = render(
      <StudyHeader
        optimization={makeOptimizationRecord({
          input,
          trials: trialsWithObjectives([9, 8, 7, 6, 5, 4, 3]),
          status: "running",
        })}
      />,
    );
    expect(screen.getByText(/Converging/u)).toBeTruthy();
    expect(verdictOf()).toBe("converging");
    unmount();

    render(
      <StudyHeader
        optimization={makeOptimizationRecord({
          input,
          trials: trialsWithObjectives([1, 2]),
          status: "running",
        })}
      />,
    );
    expect(screen.getByText(/Too early to say/u)).toBeTruthy();
    expect(verdictOf()).toBe("too-early");
  });
});
