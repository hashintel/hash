import { use } from "react";

import { NumberInput, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  findSimulator,
  SimulatorsContext,
} from "../../../../../../../react/simulators/context";
import {
  SimulatorParameterInput,
  SimulatorParameterLabel,
  visibleSimulatorParameters,
} from "../../../../../../components/simulator-parameter-input";
import {
  withSimulatorParameter,
  type ExperimentSimulatorDraft,
  type ResolvedExperimentSimulator,
  type SimulatorRefusals,
} from "./experiment-simulator-draft";
import { fieldStyle, labelStyle } from "./form-field-styles";

const unitStyle = css({
  fontWeight: "normal",
  color: "neutral.s100",
});

const itemStyle = css({
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const itemReasonStyle = css({
  color: "neutral.fg.subtle",
});

const SAMPLE_PERIOD_ID = "experiment-sample-period";

/**
 * The cells of the experiment grid that say what computes the runs: the
 * simulator, a cell per parameter its spec declares, and the spacing of the
 * samples for a simulator that has no time step to sample at. A simulator
 * that cannot run the experiment is listed, greyed, with the reason beside
 * its name.
 */
export const ExperimentSimulatorFields: React.FC<{
  draft: ExperimentSimulatorDraft;
  resolved: ResolvedExperimentSimulator;
  refusals: SimulatorRefusals;
  onChange: (draft: ExperimentSimulatorDraft) => void;
}> = ({ draft, resolved, refusals, onChange }) => {
  const { registrations } = use(SimulatorsContext);
  const { registration, parameters, timeStep } = resolved;
  const refusedIds = (pending: boolean) =>
    registrations
      .filter(({ id }) => refusals.get(id)?.pending === pending)
      .map(({ id }) => id)
      .join(" ");

  return (
    <>
      {/* A greyed item alone cannot say whether its verdict is still being
          worked out or came back negative, so the cell says which. */}
      <div
        className={fieldStyle}
        data-simulator={registration?.id}
        data-refused-simulators={refusedIds(false)}
        data-pending-simulators={refusedIds(true)}
      >
        <span className={labelStyle}>Simulator</span>
        <Select
          required
          aria-label="Simulator"
          size="sm"
          value={registration?.id ?? ""}
          items={registrations.map((candidate) => ({
            value: candidate.id,
            text: candidate.label,
            disabled: Boolean(refusals.get(candidate.id)),
          }))}
          renderItem={(simulatorId) => {
            const refusal = refusals.get(simulatorId);
            return (
              <span className={itemStyle} title={refusal?.reason}>
                {findSimulator(registrations, simulatorId)?.label ??
                  simulatorId}
                {refusal ? (
                  <span className={itemReasonStyle}> · {refusal.reason}</span>
                ) : null}
              </span>
            );
          }}
          onChange={(simulatorId) => onChange({ ...draft, simulatorId })}
        />
      </div>
      {registration
        ? visibleSimulatorParameters(registration.parameters, parameters).map(
            ([key, spec]) => {
              const id = `experiment-simulator-${registration.id}-${key}`;
              return (
                <div key={id} className={fieldStyle}>
                  <label
                    className={labelStyle}
                    htmlFor={id}
                    title={spec.description}
                  >
                    <SimulatorParameterLabel spec={spec} />
                  </label>
                  <SimulatorParameterInput
                    id={id}
                    spec={spec}
                    value={parameters[key]}
                    size="sm"
                    onChange={(value) =>
                      onChange(
                        withSimulatorParameter(
                          draft,
                          registration,
                          parameters,
                          key,
                          value,
                        ),
                      )
                    }
                  />
                </div>
              );
            },
          )
        : null}
      {registration && timeStep === null ? (
        <div className={fieldStyle}>
          <label
            className={labelStyle}
            htmlFor={SAMPLE_PERIOD_ID}
            title="Simulated seconds between two samples of the metrics. This simulator chooses its own steps, so the samples are taken at times of their own."
          >
            Sample every
            <span className={unitStyle}> (s)</span>
          </label>
          <NumberInput
            htmlForId={SAMPLE_PERIOD_ID}
            size="sm"
            min={0}
            step="any"
            value={
              draft.samplePeriod === "" ? null : Number(draft.samplePeriod)
            }
            onChange={(next) =>
              onChange({
                ...draft,
                samplePeriod: next === null ? "" : String(next),
              })
            }
          />
        </div>
      ) : null}
    </>
  );
};
