import { useMemo } from "preact/hooks";

import {
  type PlanningMode,
  SaltValidationError,
  parseRoster,
} from "../../../core.ts";
import { type StudyPlan, planStudy } from "../../../study-planning.ts";
import { StudyMetrics } from "./study-metrics.tsx";

import type { BuilderFormValues } from "../../app-controller.ts";

const MODE_OPTIONS: ReadonlyArray<{
  mode: PlanningMode;
  title: string;
  description: string;
}> = [
  {
    mode: "budget-first",
    title: "Budget first",
    description:
      "Set each annotator’s production load and guaranteed coverage; SALT derives M.",
  },
  {
    mode: "sample-first",
    title: "Exact sample first",
    description:
      "Set exactly how many cards to study and each annotator’s load; SALT derives coverage.",
  },
  {
    mode: "coverage-first",
    title: "Coverage first",
    description:
      "Set the exact sample and coverage; SALT derives the smallest per-person load.",
  },
];

const calculateLivePlan = (
  values: BuilderFormValues,
  sourcePoolSize: number,
  qualificationSize: number,
): { plan: StudyPlan | null; message: string } => {
  try {
    const annotatorIds = parseRoster(values.roster);
    const common = {
      annotatorCount: annotatorIds.length,
      eligiblePoolSize: sourcePoolSize - qualificationSize,
      qualificationSize,
    };
    const plan =
      values.plannerMode === "budget-first"
        ? planStudy({
            ...common,
            mode: values.plannerMode,
            productionCardsPerAnnotator: values.productionCardsPerAnnotator,
            coverageTarget: values.coverageTarget,
          })
        : values.plannerMode === "sample-first"
          ? planStudy({
              ...common,
              mode: values.plannerMode,
              productionCardsPerAnnotator: values.productionCardsPerAnnotator,
              sampleSize: values.sampleSize,
            })
          : planStudy({
              ...common,
              mode: values.plannerMode,
              sampleSize: values.sampleSize,
              coverageTarget: values.coverageTarget,
            });
    return { plan, message: "" };
  } catch (error) {
    return {
      plan: null,
      message:
        error instanceof SaltValidationError || error instanceof Error
          ? error.message
          : String(error),
    };
  }
};

export const PlanningStep = ({
  values,
  sourcePoolSize,
  qualificationSize,
  onChange,
  onBack,
  onReview,
}: {
  values: BuilderFormValues;
  sourcePoolSize: number;
  qualificationSize: number;
  onChange: (values: BuilderFormValues) => void;
  onBack: () => void;
  onReview: () => void;
}) => {
  const live = useMemo(
    () => calculateLivePlan(values, sourcePoolSize, qualificationSize),
    [qualificationSize, sourcePoolSize, values],
  );

  return (
    <section class="builder-step-panel" aria-labelledby="planning-title">
      <header class="builder-step-heading">
        <div>
          <p class="system-label">Step 3 · assignment model</p>
          <h2 id="planning-title">Plan the production sample.</h2>
          <p>
            Every selected card receives uniform coverage. Spare capacity stays
            unused rather than creating a partially over-reviewed stratum.
          </p>
        </div>
      </header>

      <form
        class="planning-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (live.plan) {
            onReview();
          }
        }}
      >
        <section class="form-section">
          <div class="section-heading">
            <h2>Study identity</h2>
            <span>Embedded in every export</span>
          </div>
          <div class="form-grid">
            <label class="field field-wide">
              Study title
              <input
                name="title"
                value={values.title}
                required
                onInput={(event) =>
                  onChange({ ...values, title: event.currentTarget.value })
                }
              />
            </label>
            <label class="field">
              Rubric version
              <input
                name="rubric"
                value={values.rubricVersion}
                required
                onInput={(event) =>
                  onChange({
                    ...values,
                    rubricVersion: event.currentTarget.value,
                  })
                }
              />
            </label>
            <label class="field">
              Sampling seed
              <input
                name="seed"
                value={values.seed}
                required
                spellcheck={false}
                onInput={(event) =>
                  onChange({ ...values, seed: event.currentTarget.value })
                }
              />
            </label>
          </div>
        </section>

        <section class="form-section">
          <div class="section-heading">
            <h2>Roster and planning mode</h2>
            <span>10 seconds estimated per card</span>
          </div>
          <div class="planner-input-layout">
            <label class="field field-roster">
              Annotator IDs · one per line
              <textarea
                name="roster"
                rows={9}
                placeholder={
                  "annotator-01\nannotator-02\nannotator-03\nannotator-04"
                }
                value={values.roster}
                required
                onInput={(event) =>
                  onChange({ ...values, roster: event.currentTarget.value })
                }
              />
            </label>
            <fieldset class="planner-mode-options">
              <legend>What do you know?</legend>
              {MODE_OPTIONS.map((option) => (
                <label key={option.mode}>
                  <input
                    type="radio"
                    name="planner-mode"
                    value={option.mode}
                    checked={values.plannerMode === option.mode}
                    onChange={() =>
                      onChange({
                        ...values,
                        plannerMode: option.mode,
                      })
                    }
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          <div class="planner-number-fields">
            {values.plannerMode !== "budget-first" ? (
              <label class="field">
                Exact production sample · M
                <input
                  name="sample-size"
                  type="number"
                  min={1}
                  max={sourcePoolSize - qualificationSize}
                  step={1}
                  value={values.sampleSize}
                  required
                  onInput={(event) =>
                    onChange({
                      ...values,
                      sampleSize: event.currentTarget.valueAsNumber,
                    })
                  }
                />
              </label>
            ) : null}
            {values.plannerMode !== "coverage-first" ? (
              <label class="field">
                Production cards / annotator · m
                <input
                  name="production-load"
                  type="number"
                  min={1}
                  step={1}
                  value={values.productionCardsPerAnnotator}
                  required
                  onInput={(event) =>
                    onChange({
                      ...values,
                      productionCardsPerAnnotator:
                        event.currentTarget.valueAsNumber,
                    })
                  }
                />
              </label>
            ) : null}
            {values.plannerMode !== "sample-first" ? (
              <label class="field">
                Guaranteed coverage / card
                <input
                  name="coverage"
                  type="number"
                  min={2}
                  step={1}
                  value={values.coverageTarget}
                  required
                  onInput={(event) =>
                    onChange({
                      ...values,
                      coverageTarget: event.currentTarget.valueAsNumber,
                    })
                  }
                />
              </label>
            ) : null}
            <label class="field">
              Coincident quota target
              <input
                name="quota"
                type="number"
                min={1}
                step={1}
                value={values.coincidentTarget}
                required
                onInput={(event) =>
                  onChange({
                    ...values,
                    coincidentTarget: event.currentTarget.valueAsNumber,
                  })
                }
              />
            </label>
          </div>
        </section>

        {live.plan ? (
          <StudyMetrics plan={live.plan} sourcePoolSize={sourcePoolSize} />
        ) : (
          <div class="planner-empty-readout" aria-live="polite">
            <strong>Plan waiting for feasible inputs.</strong>
            <span>
              {live.message || "Enter a roster and study constraints."}
            </span>
          </div>
        )}

        <div class="builder-step-actions">
          <button class="button button-quiet" type="button" onClick={onBack}>
            Back to anchors
          </button>
          <button
            class="button button-primary"
            type="submit"
            disabled={!live.plan}
          >
            Review this plan
          </button>
        </div>
      </form>
    </section>
  );
};
