import type {
  ArcEndpoint,
  ComponentInstance,
  ComponentPortArcEndpoint,
  ID,
  InputArc,
  OutputArc,
  PlaceArcEndpoint,
  SDCPN,
  Subnet,
} from "./types/sdcpn";

type ArcWithEndpoint = Pick<InputArc | OutputArc, "endpoint" | "placeId">;

export const placeArcEndpoint = (placeId: ID): PlaceArcEndpoint => ({
  kind: "place",
  placeId,
});

export const componentPortArcEndpoint = ({
  componentInstanceId,
  portPlaceId,
}: Omit<ComponentPortArcEndpoint, "kind">): ComponentPortArcEndpoint => ({
  kind: "componentPort",
  componentInstanceId,
  portPlaceId,
});

export const getArcEndpoint = (arc: ArcWithEndpoint): ArcEndpoint => {
  if (arc.endpoint) {
    return arc.endpoint;
  }
  if (!arc.placeId) {
    throw new Error("Arc is missing both `endpoint` and legacy `placeId`.");
  }
  return placeArcEndpoint(arc.placeId);
};

export const getArcEndpointKey = (endpoint: ArcEndpoint): string =>
  endpoint.kind === "place"
    ? `place:${endpoint.placeId}`
    : `componentPort:${endpoint.componentInstanceId}:${endpoint.portPlaceId}`;

export const parseArcEndpointKey = (key: string): ArcEndpoint | null => {
  if (key.startsWith("place:")) {
    const placeId = key.slice("place:".length);
    return placeId ? placeArcEndpoint(placeId) : null;
  }
  if (key.startsWith("componentPort:")) {
    const rest = key.slice("componentPort:".length);
    const sep = rest.indexOf(":");
    if (sep === -1) return null;
    const componentInstanceId = rest.slice(0, sep);
    const portPlaceId = rest.slice(sep + 1);
    return componentInstanceId && portPlaceId
      ? componentPortArcEndpoint({ componentInstanceId, portPlaceId })
      : null;
  }
  return null;
};

export const getArcEndpointNodeId = (endpoint: ArcEndpoint): ID =>
  endpoint.kind === "place" ? endpoint.placeId : endpoint.componentInstanceId;

export const arcEndpointsEqual = (
  left: ArcEndpoint,
  right: ArcEndpoint,
): boolean =>
  left.kind === right.kind &&
  (left.kind === "place"
    ? left.placeId === (right as PlaceArcEndpoint).placeId
    : left.componentInstanceId ===
        (right as ComponentPortArcEndpoint).componentInstanceId &&
      left.portPlaceId === (right as ComponentPortArcEndpoint).portPlaceId);

export const arcMatchesEndpoint = (
  arc: ArcWithEndpoint,
  endpoint: ArcEndpoint,
): boolean => arcEndpointsEqual(getArcEndpoint(arc), endpoint);

export const arcReferencesPlace = (
  arc: ArcWithEndpoint,
  placeId: ID,
): boolean => {
  const endpoint = getArcEndpoint(arc);
  return endpoint.kind === "place" && endpoint.placeId === placeId;
};

export const arcReferencesComponentInstance = (
  arc: ArcWithEndpoint,
  componentInstanceId: ID,
): boolean => {
  const endpoint = getArcEndpoint(arc);
  return (
    endpoint.kind === "componentPort" &&
    endpoint.componentInstanceId === componentInstanceId
  );
};

export const createArcEndpointReference = (
  endpoint: ArcEndpoint,
): Pick<InputArc | OutputArc, "endpoint" | "placeId"> =>
  endpoint.kind === "place" ? { placeId: endpoint.placeId } : { endpoint };

export const getArcEndpointPlaceId = (arc: ArcWithEndpoint): ID | null => {
  const endpoint = getArcEndpoint(arc);
  return endpoint.kind === "place" ? endpoint.placeId : null;
};

export const getComponentPortEndpointSubnet = (
  sdcpn: Pick<SDCPN, "subnets">,
  instance: Pick<ComponentInstance, "subnetId">,
): Subnet | null =>
  (sdcpn.subnets ?? []).find((subnet) => subnet.id === instance.subnetId) ??
  null;
