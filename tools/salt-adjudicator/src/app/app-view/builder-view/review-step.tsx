import { LABELS, LABEL_DETAILS } from "../../../core.ts";
import {
  type QualificationDraft,
  RECOMMENDED_QUALIFICATION_SIZE,
  type StudyPlan,
  countQualificationLabels,
} from "../../../study-planning.ts";
import { StudyMetrics } from "./study-metrics.tsx";

import type { BuilderFormValues } from "../../app-controller.ts";

export const ReviewStep = ({
  plan,
  sourcePoolSize,
  qualificationDrafts,
  values,
  onBack,
  onGenerate,
}: {
  plan: StudyPlan;
  sourcePoolSize: number;
  qualificationDrafts: readonly QualificationDraft[];
  values: BuilderFormValues;
  onBack: () => void;
  onGenerate: () => void;
}) => {
  const labelCounts = countQualificationLabels(qualificationDrafts);
  return (
    <section class="builder-step-panel" aria-labelledby="review-title">
      <header class="builder-step-heading">
        <div>
          <p class="system-label">Step 4 · final review</p>
          <h2 id="review-title">Confirm the reproducible study.</h2>
          <p>
            Generation samples the eligible pool with the seed below, then
            assigns every selected card to exactly the guaranteed coverage.
          </p>
        </div>
      </header>

      <StudyMetrics plan={plan} sourcePoolSize={sourcePoolSize} />

      <div class="review-instrument-grid">
        <section class="form-section">
          <div class="section-heading">
            <h2>Qualification set</h2>
            <span>Excluded from production</span>
          </div>
          <strong class="review-primary-value">
            {qualificationDrafts.length.toLocaleString()} anchors
          </strong>
          <dl class="review-label-counts">
            {LABELS.map((label) => (
              <div key={label} class={`label-${label.toLowerCase()}`}>
                <dt>{LABEL_DETAILS[label].name}</dt>
                <dd>{labelCounts[label]}</dd>
              </div>
            ))}
          </dl>
          {qualificationDrafts.length < RECOMMENDED_QUALIFICATION_SIZE ? (
            <p class="planner-warning">
              About {RECOMMENDED_QUALIFICATION_SIZE} anchors are recommended.
              This is advisory; SALT will not manufacture or rebalance answers.
            </p>
          ) : null}
        </section>

        <section class="form-section">
          <div class="section-heading">
            <h2>Reproducibility</h2>
            <span>Stored in the manifest</span>
          </div>
          <dl class="review-provenance">
            <div>
              <dt>Study</dt>
              <dd>{values.title}</dd>
            </div>
            <div>
              <dt>Rubric</dt>
              <dd>{values.rubricVersion}</dd>
            </div>
            <div>
              <dt>Sampling seed</dt>
              <dd>
                <code>{values.seed}</code>
              </dd>
            </div>
            <div>
              <dt>Sampling strategy</dt>
              <dd>Prescreen-stratified v1</dd>
            </div>
          </dl>
        </section>
      </div>

      <div class="builder-step-actions">
        <button class="button button-quiet" type="button" onClick={onBack}>
          Revise plan
        </button>
        <button
          class="button button-primary"
          type="button"
          onClick={onGenerate}
        >
          Generate study bundle
        </button>
      </div>
    </section>
  );
};
