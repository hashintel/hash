import {
  namesId,
  type LedgerState,
  type NetElementAddress,
} from "@hashintel/brunch-agent";
import {
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  type SDCPN,
  type Transition,
} from "@hashintel/petrinaut-core";

/** The IDs Petrinaut generates for a transition's arcs. */
const arcIdsOf = (transition: Transition): string[] => [
  ...transition.inputArcs.map((arc) =>
    generateArcId({
      inputId: getArcEndpointKey(getArcEndpoint(arc)),
      outputId: transition.id,
    }),
  ),
  ...transition.outputArcs.map((arc) =>
    generateArcId({
      inputId: transition.id,
      outputId: getArcEndpointKey(getArcEndpoint(arc)),
    }),
  ),
];

/** The stored IDs of the net's elements of one kind, in the root net and its subnets. */
const elementIds = (net: SDCPN, kind: NetElementAddress["kind"]): string[] => {
  const nets = [net, ...(net.subnets ?? [])];
  switch (kind) {
    case "place":
      return nets.flatMap(({ places }) => places.map(({ id }) => id));
    case "transition":
      return nets.flatMap(({ transitions }) => transitions.map(({ id }) => id));
    case "arc":
      return nets.flatMap(({ transitions }) => transitions.flatMap(arcIdsOf));
    case "type":
      return nets.flatMap(({ types }) => types.map(({ id }) => id));
    case "typeElement":
      return nets.flatMap(({ types }) =>
        types.flatMap(({ elements }) =>
          elements.map(({ elementId }) => elementId),
        ),
      );
    case "differentialEquation":
      return nets.flatMap(({ differentialEquations }) =>
        differentialEquations.map(({ id }) => id),
      );
    case "parameter":
      return nets.flatMap(({ parameters }) => parameters.map(({ id }) => id));
    case "componentInstance":
      return nets.flatMap(({ componentInstances }) =>
        (componentInstances ?? []).map(({ id }) => id),
      );
    case "scenario":
      return (net.scenarios ?? []).map(({ id }) => id);
    case "metric":
      return (net.metrics ?? []).map(({ id }) => id);
    case "subnet":
      return (net.subnets ?? []).map(({ id }) => id);
  }
};

/**
 * The reflections naming a net element the open net lacks, by address. A
 * reflection naming no net element is never among them.
 */
export const reflectionsNotInNet = (
  ledger: LedgerState,
  net: SDCPN,
): ReadonlySet<string> => {
  const idsByKind = new Map<NetElementAddress["kind"], string[]>();
  const has = (address: NetElementAddress) => {
    let ids = idsByKind.get(address.kind);
    if (ids === undefined) {
      ids = elementIds(net, address.kind);
      idsByKind.set(address.kind, ids);
    }
    return ids.some((id) => namesId(address.id, id));
  };
  return new Set(
    ledger.reflections
      .filter((reflection) =>
        (reflection.netElements ?? []).some((address) => !has(address)),
      )
      .map(({ address }) => address),
  );
};
