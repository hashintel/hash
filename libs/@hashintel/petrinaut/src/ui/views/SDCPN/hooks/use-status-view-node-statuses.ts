import { use } from "react";

import {
  createStatusViewFrameEvaluator,
  getStatusViewEvaluationScope,
  parseScopedId,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../../react/execution-frame/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { StatusConditionArtifactsContext } from "../../../../react/status-condition-artifacts";

import type {
  ComponentInstanceStatusSummary,
  ComponentInstanceStatusLabelCount,
} from "../reactflow-types";

// Stable empty result for the bail-out paths, so consumers see one identity.
const noSummaries: ReadonlyMap<string, ComponentInstanceStatusSummary> =
  new Map();

/**
 * Per-componentInstance status summaries for the currently viewed frame,
 * keyed by instance node id. A tracked token inside an instance's copies of
 * subnet places counts towards every instance along its scope path, so the
 * badge shows on the outer instance on the root canvas and on the nested
 * instance when its parent subnet is opened. An instance appears only when a
 * status view tracks at least one of its tokens; the first such view (in
 * `statusViews` order) provides the summary.
 */
export function useStatusViewNodeStatuses(): ReadonlyMap<
  string,
  ComponentInstanceStatusSummary
> {
  const { petriNetDefinition } = use(SDCPNContext);
  const { currentFrameReader } = use(ExecutionFrameSourceContext);
  const { statusConditions } = use(StatusConditionArtifactsContext);

  const statusViews = petriNetDefinition.statusViews ?? [];
  // Nested instances exist only under root instances, so no root instances
  // means no instance can hold tracked tokens.
  const hasComponentInstances =
    (petriNetDefinition.componentInstances ?? []).length > 0;

  // Scope and evaluators depend only on the definition and the compiled
  // conditions, not on the viewed frame, so this block memoizes across
  // frame changes under the React Compiler.
  const evaluators = (() => {
    if (statusViews.length === 0 || !hasComponentInstances) {
      return [];
    }
    const { places, types } = getStatusViewEvaluationScope(petriNetDefinition);
    return statusViews.map((statusView) => ({
      statusView,
      evaluate: createStatusViewFrameEvaluator({
        statusView,
        places,
        types,
        statusConditions,
      }),
    }));
  })();

  if (evaluators.length === 0 || !currentFrameReader) {
    return noSummaries;
  }

  const summaries = new Map<string, ComponentInstanceStatusSummary>();

  for (const { statusView, evaluate } of evaluators) {
    const countsByInstanceAndLabel = new Map<string, Map<string, number>>();
    for (const assignment of evaluate(currentFrameReader).values()) {
      const { instancePath } = parseScopedId(assignment.placeId);
      for (const instanceId of instancePath) {
        const labelCounts =
          countsByInstanceAndLabel.get(instanceId) ?? new Map<string, number>();
        labelCounts.set(
          assignment.labelId,
          (labelCounts.get(assignment.labelId) ?? 0) + 1,
        );
        countsByInstanceAndLabel.set(instanceId, labelCounts);
      }
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
      const [firstLabel] = labels;
      if (!firstLabel) {
        continue;
      }
      const dominantLabel = labels.reduce(
        (dominant, candidate) =>
          candidate.count > dominant.count ? candidate : dominant,
        firstLabel,
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
