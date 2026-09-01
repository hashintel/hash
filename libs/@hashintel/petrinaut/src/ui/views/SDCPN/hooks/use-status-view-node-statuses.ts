import { use, useEffect, useState } from "react";

import {
  createStatusViewFrameEvaluator,
  formatScopedId,
  parseScopedId,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../../react/execution-frame/context";
import { LanguageClientContext } from "../../../../react/lsp/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";

import type {
  ComponentInstanceStatusSummary,
  ComponentInstanceStatusLabelCount,
} from "../reactflow-types";
import type {
  Color,
  HirStatusConditionArtifact,
  Place,
  SDCPN,
} from "@hashintel/petrinaut-core";

/**
 * The place and colour universe status views evaluate against: the root
 * net's places, plus each componentInstance's copies of its subnet's places
 * under scoped ids — the id space execution frames key places by. Subnet
 * colours keep their definition ids, matching the copies' `colorId`.
 */
const getEvaluationScope = (
  sdcpn: SDCPN,
): { places: Place[]; types: Color[] } => {
  const places: Place[] = [...sdcpn.places];
  const types: Color[] = [
    ...sdcpn.types,
    ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.types),
  ];

  const subnetById = new Map(
    (sdcpn.subnets ?? []).map((subnet) => [subnet.id, subnet]),
  );
  const visitInstances = (
    instances: NonNullable<SDCPN["componentInstances"]>,
    idPath: readonly string[],
  ): void => {
    for (const instance of instances) {
      const subnet = subnetById.get(instance.subnetId);
      if (!subnet) {
        continue;
      }
      const instanceIdPath = [...idPath, instance.id];
      for (const place of subnet.places) {
        places.push({
          ...place,
          id: formatScopedId(instanceIdPath, place.id),
        });
      }
      visitInstances(subnet.componentInstances ?? [], instanceIdPath);
    }
  };
  visitInstances(sdcpn.componentInstances ?? [], []);

  return { places, types };
};

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
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { currentFrameReader } = use(ExecutionFrameSourceContext);

  const statusViews = petriNetDefinition.statusViews ?? [];
  const hasConditions = statusViews.some((statusView) =>
    statusView.labels.some(
      (label) => (label.tokenCondition ?? "").trim() !== "",
    ),
  );

  const [statusConditions, setStatusConditions] = useState<
    Record<string, HirStatusConditionArtifact>
  >({});

  useEffect(() => {
    if (!hasConditions) {
      return;
    }
    let cancelled = false;
    void requestHirArtifacts(petriNetDefinition).then(({ artifacts }) => {
      if (!cancelled) {
        setStatusConditions(artifacts.statusConditions);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasConditions, petriNetDefinition, requestHirArtifacts]);

  const summaries = new Map<string, ComponentInstanceStatusSummary>();
  if (statusViews.length === 0 || !currentFrameReader) {
    return summaries;
  }

  const { places, types } = getEvaluationScope(petriNetDefinition);

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
