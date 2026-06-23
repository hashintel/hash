import { getArcEndpoint } from "../../arc-endpoints";

import type {
  PetrinautExtensionSettings,
  TransitionLogicAvailability,
} from "../../extensions";
import type {
  ComponentInstance,
  InputArc,
  OutputArc,
  Place,
  SDCPN,
  Subnet,
  Transition,
} from "../../types/sdcpn";

type NetWithComponentInstances = {
  places: Place[];
  componentInstances?: ComponentInstance[];
};

export const createArcPlaceResolver = (
  sdcpn: SDCPN,
  net: NetWithComponentInstances = sdcpn,
): ((arc: InputArc | OutputArc) => Place | undefined) => {
  const placeById = new Map(net.places.map((place) => [place.id, place]));
  const subnetById = new Map(
    (sdcpn.subnets ?? []).map((subnet) => [subnet.id, subnet]),
  );
  const instanceById = new Map(
    (net.componentInstances ?? []).map((instance) => [instance.id, instance]),
  );

  return (arc) => {
    const endpoint = getArcEndpoint(arc);

    if (endpoint.kind === "place") {
      return placeById.get(endpoint.placeId);
    }

    const instance = instanceById.get(endpoint.componentInstanceId);
    const subnet = instance ? subnetById.get(instance.subnetId) : undefined;

    return subnet?.places.find(
      (place) => place.id === endpoint.portPlaceId && place.isPort,
    );
  };
};

export const getTransitionCodeAvailability = ({
  transition,
  sdcpn,
  net,
  extensions,
}: {
  transition: Transition;
  sdcpn: SDCPN;
  net?: SDCPN | Subnet;
  extensions: PetrinautExtensionSettings;
}): TransitionLogicAvailability => {
  const resolveArcPlace = createArcPlaceResolver(sdcpn, net);

  const hasTypedNonInhibitorInputPlace =
    extensions.colors &&
    transition.inputArcs.some((arc) => {
      if (arc.type === "inhibitor") {
        return false;
      }

      return resolveArcPlace(arc)?.colorId != null;
    });

  const hasTypedOutputPlace =
    extensions.colors &&
    transition.outputArcs.some((arc) => resolveArcPlace(arc)?.colorId != null);

  const predicateLambda =
    extensions.stochasticity || hasTypedNonInhibitorInputPlace;
  const stochasticLambda = extensions.stochasticity;

  return {
    lambda: predicateLambda || stochasticLambda,
    predicateLambda,
    stochasticLambda,
    transitionKernel: hasTypedOutputPlace,
  };
};
