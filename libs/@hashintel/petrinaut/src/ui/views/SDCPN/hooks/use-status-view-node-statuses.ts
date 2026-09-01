import { use } from "react";

import {
  createStatusViewFrameEvaluator,
  parseScopedId,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../../react/execution-frame/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import {
  getStatusViewEvaluationScope,
  useStatusConditionArtifacts,
} from "../../shared/status-view-tracking";

import type {
  ComponentInstanceStatusSummary,
  ComponentInstanceStatusLabelCount,
} from "../reactflow-types";

/**
 * Per-componentInstance status summaries for the currently viewed frame,
 * keyed by the instance's node id. An instance appears only when a status
 * view tracks at least one token inside its copies of subnet places; the
 * first such view (in `statusViews` order) provides the summary.
 */
export function useStatusViewNodeStatuses(): Map<
  string,
  ComponentInstanceStatusSummary
> {
  const { petriNetDefinition } = use(SDCPNContext);
  const { currentFrameReader } = use(ExecutionFrameSourceContext);
  const statusConditions = useStatusConditionArtifacts();

  const statusViews = petriNetDefinition.statusViews ?? [];
  const summaries = new Map<string, ComponentInstanceStatusSummary>();
  if (statusViews.length === 0 || !currentFrameReader) {
    return summaries;
  }

  const { places, types } = getStatusViewEvaluationScope(petriNetDefinition);

  for (const statusView of statusViews) {
    const evaluate = createStatusViewFrameEvaluator({
      statusView,
      places,
      types,
      statusConditions,
    });
    const countsByInstanceAndLabel = new Map<string, Map<string, number>>();
    for (const assignment of evaluate(currentFrameReader).values()) {
      const { instancePath } = parseScopedId(assignment.placeId);
      const instanceId = instancePath[0];
      if (instanceId === undefined) {
        continue;
      }
      const labelCounts =
        countsByInstanceAndLabel.get(instanceId) ?? new Map<string, number>();
      labelCounts.set(
        assignment.labelId,
        (labelCounts.get(assignment.labelId) ?? 0) + 1,
      );
      countsByInstanceAndLabel.set(instanceId, labelCounts);
    }

    for (const [instanceId, labelCounts] of countsByInstanceAndLabel) {
      if (summaries.has(instanceId)) {
        continue;
      }
      const labels: ComponentInstanceStatusLabelCount[] = [];
      for (const label of statusView.labels) {
        const count = labelCounts.get(label.id) ?? 0;
        if (count > 0) {
          labels.push({
            labelId: label.id,
            name: label.name,
            displayColor: label.displayColor,
            count,
          });
        }
      }
      const dominantLabel = labels.reduce(
        (dominant, candidate) =>
          candidate.count > dominant.count ? candidate : dominant,
        labels[0]!,
      );
      summaries.set(instanceId, {
        statusViewId: statusView.id,
        statusViewName: statusView.name,
        labels,
        tintColor: dominantLabel.displayColor,
      });
    }
  }

  return summaries;
}
