import { use, useEffect, useState } from "react";

import { formatScopedId } from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../react/lsp/context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";

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
export const getStatusViewEvaluationScope = (
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
 * The net's compiled status-label token conditions, recompiled through the
 * LSP worker whenever the document changes. Empty until compilation lands
 * (and permanently when no label declares a condition — evaluation then
 * needs no artifacts).
 */
export function useStatusConditionArtifacts(): Record<
  string,
  HirStatusConditionArtifact
> {
  const { petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);

  const hasConditions = (petriNetDefinition.statusViews ?? []).some(
    (statusView) =>
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

  return statusConditions;
}
