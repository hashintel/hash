import { useState } from "react";

import type { Scenario } from "@hashintel/petrinaut-core";

/**
 * The state a run form edits for a saved scenario, seeded from the scenario
 * by `seedState`. Null while no scenario is selected, so a scenario selected
 * again later seeds afresh.
 *
 * It reseeds when the scenario's content changes: saving an edit to the
 * scenario shows the new definition instead of the old one. By content, not
 * identity: the document hands out a fresh scenario object on every edit
 * anywhere in the net, and reseeding on those remounted the form, and
 * restarted its language session, for every node dragged on the canvas.
 * `key` changes with every reseed and scenario switch; keying the form on it
 * remounts the form, discarding an undo history whose snapshots belong to
 * another definition.
 */
export const useScenarioRun = <State>(
  scenario: Scenario | undefined,
  seedState: (scenario: Scenario) => State,
): {
  key: string;
  state: State;
  setState: (state: State) => void;
} | null => {
  const content = scenario ? JSON.stringify(scenario) : null;
  const [run, setRun] = useState<{
    scenarioId: string;
    seededFrom: string;
    seed: number;
    state: State;
  } | null>(null);
  const current =
    scenario && run?.scenarioId === scenario.id && run.seededFrom === content;
  if (scenario && content !== null && !current) {
    setRun({
      scenarioId: scenario.id,
      seededFrom: content,
      seed: (run?.seed ?? 0) + 1,
      state: seedState(scenario),
    });
  }
  if (!scenario && run) {
    setRun(null);
  }
  return current
    ? {
        key: `${run.scenarioId}:${run.seed}`,
        state: run.state,
        setState: (state) =>
          setRun((previous) => previous && { ...previous, state }),
      }
    : null;
};
