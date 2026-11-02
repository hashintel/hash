/**
 * Component libraries: ready-made subnets a host or a plugin offers, which the
 * editor copies into a document when the user instantiates one.
 *
 * A component's ids are local to its template; the copy gets ids derived from
 * the library and component ids, so instantiating the same component twice
 * yields the same subnet, and a document never holds two copies of one
 * component.
 */

import { toPetrinautId } from "../petrinaut-id";

import type { ArcEndpoint, InputArc, OutputArc, Subnet } from "../types/sdcpn";

/** A subnet as a library writes it, before it has a document id or a source. */
export type ComponentTemplate = Omit<Subnet, "id" | "source">;

/** A component a library offers. */
export type LibraryComponent = {
  /** Stable within the library. */
  id: string;
  name: string;
  description?: string;
  /** Extra search terms beyond the name. */
  keywords?: readonly string[];
  template: ComponentTemplate;
};

/** A named set of components, such as the ones a plugin provides. */
export type ComponentLibrary = {
  /** Stable, such as a plugin id. Recorded as a subnet's `source.library`. */
  id: string;
  name: string;
  description?: string;
  components: readonly LibraryComponent[];
};

/** The id the copy of a library component has in every document. */
export const libraryComponentSubnetId = (
  library: string,
  component: string,
): string => toPetrinautId(`${library}/${component}`);

/**
 * The subnet a library component becomes in a document. Every id inside the
 * template is scoped to the component, so two components may both call a
 * place `in`. Nested instances keep their `subnetId`: a template that
 * instantiates another component names that component's document subnet id,
 * see {@link libraryComponentSubnetId}.
 */
export const instantiateLibraryComponent = (
  library: string,
  component: LibraryComponent,
): Subnet => {
  const scoped = (localId: string): string =>
    toPetrinautId(`${library}/${component.id}#${localId}`);
  const scopedEndpoint = (endpoint: ArcEndpoint): ArcEndpoint =>
    endpoint.kind === "place"
      ? { kind: "place", placeId: scoped(endpoint.placeId) }
      : {
          kind: "componentPort",
          componentInstanceId: scoped(endpoint.componentInstanceId),
          portPlaceId: endpoint.portPlaceId,
        };
  const scopedArc = <Arc extends InputArc | OutputArc>(arc: Arc): Arc => ({
    ...arc,
    ...(arc.placeId === undefined ? {} : { placeId: scoped(arc.placeId) }),
    ...(arc.endpoint === undefined
      ? {}
      : { endpoint: scopedEndpoint(arc.endpoint) }),
  });
  const { template } = component;

  return {
    id: libraryComponentSubnetId(library, component.id),
    name: template.name,
    ...(template.description === undefined
      ? {}
      : { description: template.description }),
    ...(template.metadata === undefined ? {} : { metadata: template.metadata }),
    source: { library, component: component.id },
    parameters: template.parameters.map((parameter) => ({
      ...parameter,
      id: scoped(parameter.id),
    })),
    types: template.types.map((type) => ({ ...type, id: scoped(type.id) })),
    differentialEquations: template.differentialEquations.map((equation) => ({
      ...equation,
      id: scoped(equation.id),
      colorId: equation.colorId === null ? null : scoped(equation.colorId),
    })),
    places: template.places.map((place) => ({
      ...place,
      id: scoped(place.id),
      colorId: place.colorId === null ? null : scoped(place.colorId),
      differentialEquationId:
        place.differentialEquationId === null
          ? null
          : scoped(place.differentialEquationId),
    })),
    componentInstances: (template.componentInstances ?? []).map((instance) => ({
      ...instance,
      id: scoped(instance.id),
      parameterValues: Object.fromEntries(
        Object.entries(instance.parameterValues).map(([key, value]) => [
          key,
          value,
        ]),
      ),
    })),
    fusions: (template.fusions ?? []).map((fusion) => ({
      ...fusion,
      id: scoped(fusion.id),
      members: fusion.members.map(scopedEndpoint),
    })),
    transitions: template.transitions.map((transition) => ({
      ...transition,
      id: scoped(transition.id),
      inputArcs: transition.inputArcs.map(scopedArc),
      outputArcs: transition.outputArcs.map(scopedArc),
    })),
  };
};
