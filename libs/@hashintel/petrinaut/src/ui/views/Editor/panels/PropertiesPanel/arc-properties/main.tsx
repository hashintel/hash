import { use } from "react";

import {
  arcMatchesEndpoint,
  parseArcId,
  parseArcEndpointKey,
  placeArcEndpoint,
  type ArcEndpoint,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { CompositionContext } from "../../../../../../react/state/composition-context";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { portLabel, resolvePort } from "../arc-endpoint";
import { ArcPropertiesContext, type ArcPropertiesData } from "./context";
import { arcSubViews } from "./sub-views";

interface ArcPropertiesProps {
  arcId: string;
  petriNetDefinition: SDCPN;
  fullSdcpn: SDCPN;
}

export const ArcProperties: React.FC<ArcPropertiesProps> = ({
  arcId,
  petriNetDefinition,
  fullSdcpn,
}) => {
  const { libraries } = use(CompositionContext);
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
    return petriNetDefinition.places.some((place) => place.id === id)
      ? placeArcEndpoint(id)
      : null;
  };

  const endpointName = (endpoint: ArcEndpoint): string =>
    endpoint.kind === "place"
      ? (petriNetDefinition.places.find(
          (place) => place.id === endpoint.placeId,
        )?.name ?? "Unknown place")
      : portLabel(
          resolvePort(endpoint, petriNetDefinition, fullSdcpn, libraries),
        );

  const sourceEndpoint = endpointFromId(sourceId);
  const targetEndpoint = endpointFromId(targetId);
  const sourceTransition = petriNetDefinition.transitions.find(
    (tr) => tr.id === sourceId,
  );
  const targetTransition = petriNetDefinition.transitions.find(
    (tr) => tr.id === targetId,
  );

  let data: ArcPropertiesData;

  if (sourceEndpoint && targetTransition) {
    const arc = targetTransition.inputArcs.find((ia) =>
      arcMatchesEndpoint(ia, sourceEndpoint),
    );
    data = {
      transitionId: targetTransition.id,
      endpoint: sourceEndpoint,
      arcDirection: "input",
      sourceName: endpointName(sourceEndpoint),
      targetName: targetTransition.name,
      weight: arc?.weight ?? 1,
      type: arc?.type ?? "standard",
    };
  } else if (sourceTransition && targetEndpoint) {
    const arc = sourceTransition.outputArcs.find((oa) =>
      arcMatchesEndpoint(oa, targetEndpoint),
    );
    data = {
      transitionId: sourceTransition.id,
      endpoint: targetEndpoint,
      arcDirection: "output",
      sourceName: sourceTransition.name,
      targetName: endpointName(targetEndpoint),
      weight: arc?.weight ?? 1,
      type: "standard",
    };
  } else {
    return null;
  }

  return (
    <ArcPropertiesContext value={data}>
      <VerticalSubViewsContainer name="arc-properties" subViews={arcSubViews} />
    </ArcPropertiesContext>
  );
};
