import {
  type Label,
  LABELS,
  LABEL_DETAILS,
  SaltValidationError,
  relationSummaries,
} from "../../../core.ts";

import type { JSX } from "preact";

export type RelationSummary = ReturnType<typeof relationSummaries>[number];

export const formatInteger = (value: number): string =>
  new Intl.NumberFormat("en-US").format(Math.round(value));

export const formatPercent = (value: number | null, digits = 0): string =>
  value === null || !Number.isFinite(value)
    ? "—"
    : `${(value * 100).toFixed(digits)}%`;

export const formatAlpha = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(3);

export const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
};

export const Issues = ({ error }: { error: unknown }) => {
  if (!error) {
    return null;
  }
  const issues =
    error instanceof SaltValidationError && error.issues.length > 0
      ? error.issues
      : [error instanceof Error ? error.message : String(error)];
  return (
    <div class="notice notice-error" role="alert">
      <strong>
        {error instanceof Error ? error.message : "Something went wrong."}
      </strong>
      {issues.length > 0 ? (
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export const LabelTooltip = ({ label, id }: { label: Label; id: string }) => {
  const detail = LABEL_DETAILS[label];
  return (
    <span class="label-tooltip" id={id} role="tooltip">
      <strong>{detail.name}</strong>
      <span>{detail.description}</span>
    </span>
  );
};

export const Distribution = ({ summary }: { summary: RelationSummary }) => (
  <div
    class="distribution"
    aria-label={`${summary.relation_id} label distribution`}
  >
    {LABELS.map((label) => {
      const width =
        summary.labels.length === 0
          ? 0
          : (summary.counts[label] / summary.labels.length) * 100;
      return (
        <span
          key={label}
          class={`label-${label.toLowerCase()}`}
          style={{ "--share": `${width}%` } as JSX.CSSProperties}
          title={`${LABEL_DETAILS[label].name}: ${summary.counts[label]}`}
        />
      );
    })}
  </div>
);

export const LabelSequence = ({ labels }: { labels: readonly Label[] }) => (
  <span class="label-sequence">
    {labels.map((label, labelIndex) => (
      <span
        key={`${label}-${labelIndex}`}
        class={`label-${label.toLowerCase()}`}
      >
        {label}
      </span>
    ))}
  </span>
);
