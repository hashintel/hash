import type { StudyPlan } from "../../../study-planning.ts";

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const roundedMinutes = Math.ceil(seconds / 60);
  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`;
  }
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
};

export const StudyMetrics = ({
  plan,
  sourcePoolSize,
}: {
  plan: StudyPlan;
  sourcePoolSize: number;
}) => (
  <section class="planner-readout" aria-live="polite">
    <div class="section-heading">
      <div>
        <p class="system-label">Live plan</p>
        <h2>
          {plan.sampleSize.toLocaleString()} cards · {plan.coverageTarget}×
        </h2>
      </div>
      <span>{plan.spareCapacity.toLocaleString()} unused slots</span>
    </div>
    <dl class="planner-metrics">
      <div>
        <dt>
          <abbr title="Imported source pool">N</abbr> · source
        </dt>
        <dd>{sourcePoolSize.toLocaleString()}</dd>
      </div>
      <div>
        <dt>
          <abbr title="Number of annotators">n</abbr> · annotators
        </dt>
        <dd>{plan.annotatorCount.toLocaleString()}</dd>
      </div>
      <div>
        <dt>
          <abbr title="Selected production sample">M</abbr> · sampled
        </dt>
        <dd>{plan.sampleSize.toLocaleString()}</dd>
      </div>
      <div>
        <dt>
          <abbr title="Production cards budgeted per annotator">m</abbr> · cap
        </dt>
        <dd>{plan.productionCardsPerAnnotator.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Guaranteed coverage</dt>
        <dd>{plan.coverageTarget}×</dd>
      </div>
      <div>
        <dt>Eligible pool</dt>
        <dd>{plan.eligiblePoolSize.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Production load</dt>
        <dd>
          {plan.minimumProductionLoad.toLocaleString()}–
          {plan.maximumProductionLoad.toLocaleString()}
        </dd>
      </div>
      <div>
        <dt>Qualification overhead</dt>
        <dd>
          {plan.qualificationSize.toLocaleString()} ·{" "}
          {formatDuration(plan.qualificationSeconds)}
        </dd>
      </div>
      <div class="planner-metric-wide">
        <dt>Estimated total time / annotator</dt>
        <dd>
          {formatDuration(plan.minimumTotalSeconds)}
          {plan.minimumTotalSeconds === plan.maximumTotalSeconds
            ? ""
            : `–${formatDuration(plan.maximumTotalSeconds)}`}
        </dd>
      </div>
    </dl>
    {plan.warnings.map((warning) => (
      <p class="planner-warning" role="note" key={warning}>
        {warning}
      </p>
    ))}
  </section>
);
