/**
 * Human-readable labels for ingest pipeline progress events.
 *
 * Maps coarse phase/step combinations to user-facing copy.
 * See: internal/apps/agent-workflows/src/temporal/workflow-step-labels.ts
 */
import type { RunStatus } from "./types";

/** Phase/step → human-readable status line. */
const PHASE_STEP_LABELS: Record<string, Record<string, string>> = {
  upload: {
    received: "Upload received",
  },
  classification: {
    classifying: "Classifying document",
    complete: "Document classified",
  },
  preparation: {
    parsing: "Parsing document",
    complete: "Preparation complete",
  },
  discovery: {
    running: "Running extraction",
    "Discovering mentions": "Discovering mentions",
    "Merging coreference": "Merging coreferences",
    "Extracting claims": "Extracting claims",
    "Deduplicating claims": "Deduplicating claims",
    "Structured extraction": "Structured extraction",
    complete: "Extraction complete",
  },
  results: {
    assembling: "Assembling results",
    complete: "Done",
  },
};

/**
 * Derive a human-readable status label from the current RunStatus.
 */
export function getProgressLabel(status: RunStatus): string {
  if (status.status === "succeeded") {
    return "Done";
  }
  if (status.status === "failed") {
    return status.error ?? "Run failed";
  }

  const phaseLabels = status.phase
    ? PHASE_STEP_LABELS[status.phase]
    : undefined;
  if (phaseLabels && status.step) {
    const label = phaseLabels[status.step];
    if (label) {
      return label;
    }
  }

  // Fallback: show raw phase/step
  if (status.step) {
    return status.step;
  }
  if (status.phase) {
    return status.phase.charAt(0).toUpperCase() + status.phase.slice(1);
  }

  return "Processing";
}

/**
 * Format counts into a compact summary string.
 */
export function getCountsSummary(counts: RunStatus["counts"]): string | null {
  if (!counts) {
    return null;
  }
  const items = [
    counts.pages && `${counts.pages} pages`,
    counts.chunks && `${counts.chunks} chunks`,
    counts.mentions && `${counts.mentions} entities found`,
    counts.claims && `${counts.claims} claims`,
  ].filter(Boolean);
  return items.length > 0 ? items.join(" · ") : null;
}
