/**
 * What the basis query answers from: the element its selector names in the
 * latest net view, and the Ledger trace as the model reads it.
 */

import { migrateLegacyComponentKeys } from "@hashintel/petrinaut-core";

import { generatedArcId, namesId, type ArcElement } from "./net-element-ids";

import type { BasisQuerySelector } from "../ledger/basis-query";
import type { NetElementAddress } from "../ledger/construction/reflections";
import type { LedgerTrace } from "../ledger/trace";
import type { NetElement } from "./net-changes";
import type { NetStructure } from "./net-readers";

/** A net element the selector can match: by ID, by name, or by its arc's endpoints. */
export type BasisQueryTarget = Omit<NetElement, "kind"> & {
  readonly name: string;
};

/** The root net and each component: places, transitions and their other items can sit in either. */
const netsOf = (definition: NetStructure) => [
  definition,
  ...(definition.components ?? []),
];

const elements = (
  definition: NetStructure,
  kind: BasisQuerySelector["kind"],
): BasisQueryTarget[] => {
  if (kind === "scenario") return definition.scenarios ?? [];
  if (kind === "metric") return definition.metrics ?? [];
  if (kind === "component") return definition.components ?? [];
  return netsOf(definition).flatMap((net) => netElements(net, kind));
};

const netElements = (
  net: ReturnType<typeof netsOf>[number],
  kind: Exclude<
    BasisQuerySelector["kind"],
    "scenario" | "metric" | "component"
  >,
): BasisQueryTarget[] => {
  if (kind === "place") return net.places;
  if (kind === "transition") return net.transitions;
  if (kind === "type") return net.types;
  if (kind === "parameter") return net.parameters;
  if (kind === "differentialEquation") return net.differentialEquations;
  if (kind === "componentInstance") return net.componentInstances ?? [];
  if (kind === "fusion") return net.fusions ?? [];
  if (kind === "typeElement")
    return net.types.flatMap((color) =>
      color.elements.map((element) => ({
        id: element.elementId,
        name: element.name,
      })),
    );
  kind satisfies "arc";
  // An arc is selected by its transition and endpoint, and identified by the ID Petrinaut generates from them.
  return net.transitions.flatMap((transition) => {
    const arcElements = (
      arcDirection: ArcElement["arcDirection"],
      arcs: readonly Pick<
        (typeof transition.inputArcs)[number],
        "endpoint" | "placeId"
      >[],
    ) =>
      arcs.map((arc) => {
        const placeId =
          arc.endpoint?.kind === "place"
            ? arc.endpoint.placeId
            : (arc.placeId ?? "");
        const element = { transitionId: transition.id, arcDirection, placeId };
        return {
          arc: element,
          id: generatedArcId(element),
          name: `${transition.name} ${arcDirection}`,
        };
      });
    return [
      ...arcElements("input", transition.inputArcs),
      ...arcElements("output", transition.outputArcs),
    ];
  });
};

/**
 * The one element of the selector's kind in a net view that the selector
 * names, or nothing when none or several match. A stored view can list its
 * components under `subnets`, as a document written with that key does: it is
 * read the way a file is.
 */
export const basisQueryTarget = (
  definition: NetStructure,
  selector: BasisQuerySelector,
): BasisQueryTarget | undefined => {
  const candidates = elements(
    migrateLegacyComponentKeys(definition),
    selector.kind,
  ).filter(
    (element) =>
      namesId(selector.id, element.id) ||
      (selector.name !== undefined && element.name === selector.name) ||
      (selector.kind === "arc" &&
        element.arc !== undefined &&
        namesId(selector.transitionId, element.arc.transitionId) &&
        selector.arcDirection === element.arc.arcDirection &&
        namesId(selector.placeId, element.arc.placeId)),
  );
  return candidates.length === 1 ? candidates.at(0) : undefined;
};

/** Whether a reflection's net element address names the target, as the document or the model wrote it. */
export const namesBasisQueryTarget =
  (kind: BasisQuerySelector["kind"], target: Omit<NetElement, "kind">) =>
  (address: NetElementAddress) =>
    address.kind === kind && namesId(address.id, target.id);

/** A record as the model reads it: its ID and fields, with the turn it was recorded in. */
const recordContent = <Fields extends { address: string }>({
  address,
  ...fields
}: Fields) => ({ id: address, ...fields });

/** The trace as the model reads it: record IDs in place of addresses. */
export const basisTraceForModel = (trace: LedgerTrace) => ({
  reflections: trace.reflections.map(recordContent),
  obligations: trace.obligations.map(recordContent),
  claims: trace.claims.map(recordContent),
  entities: trace.entities.map(recordContent),
  superseded: trace.superseded,
  turns: trace.turns,
});
