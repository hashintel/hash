import {
  arcMatchesEndpoint,
  parseArcEndpointKey,
  parseArcId,
  placeArcEndpoint,
  type ArcEndpoint,
  type ResolvedLibraries,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { portLabel, resolvePort } from "../arc-endpoint";

import type { ArcPropertiesData } from "./context";

/**
 * What the arc panel shows for an arc of `net`: its transition, the place or
 * port at its other end, its weight and its type. `null` when the id does not
 * parse or the net no longer has both ends.
 */
export const arcPropertiesData = (
  arcId: string,
  net: SDCPN,
  sdcpn: SDCPN,
  libraries: ResolvedLibraries,
): ArcPropertiesData | null => {
  const parsed = parseArcId(arcId);
  if (!parsed) {
    return null;
  }

  const { sourceId, targetId } = parsed;

  const endpointFromId = (id: string): ArcEndpoint | null => {
    const parsedEndpoint = parseArcEndpointKey(id);
    if (parsedEndpoint) {
      return parsedEndpoint;
    }
    return net.places.some((place) => place.id === id)
      ? placeArcEndpoint(id)
      : null;
  };

  const endpointName = (endpoint: ArcEndpoint): string =>
    endpoint.kind === "place"
      ? (net.places.find((place) => place.id === endpoint.placeId)?.name ??
        "Unknown place")
      : portLabel(resolvePort(endpoint, net, sdcpn, libraries));

  const sourceEndpoint = endpointFromId(sourceId);
  const targetEndpoint = endpointFromId(targetId);
  const sourceTransition = net.transitions.find((tr) => tr.id === sourceId);
  const targetTransition = net.transitions.find((tr) => tr.id === targetId);

  if (sourceEndpoint && targetTransition) {
    const arc = targetTransition.inputArcs.find((ia) =>
      arcMatchesEndpoint(ia, sourceEndpoint),
    );
    return {
      transitionId: targetTransition.id,
      endpoint: sourceEndpoint,
      arcDirection: "input",
      sourceName: endpointName(sourceEndpoint),
      targetName: targetTransition.name,
      weight: arc?.weight ?? 1,
      type: arc?.type ?? "standard",
    };
  }

  if (sourceTransition && targetEndpoint) {
    const arc = sourceTransition.outputArcs.find((oa) =>
      arcMatchesEndpoint(oa, targetEndpoint),
    );
    return {
      transitionId: sourceTransition.id,
      endpoint: targetEndpoint,
      arcDirection: "output",
      sourceName: sourceTransition.name,
      targetName: endpointName(targetEndpoint),
      weight: arc?.weight ?? 1,
      type: "standard",
    };
  }

  return null;
};
