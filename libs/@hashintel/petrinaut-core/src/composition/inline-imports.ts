/**
 * Inlining: a document with the components it takes from its imports made
 * its own. Each becomes a component of the document itself, and whatever
 * named it in its library names that one. An export that must read without
 * its libraries is this under fresh ids. The simulator, the compiler and the
 * language server take one net and no libraries, so they are handed this
 * too, under ids that are the same from one call to the next.
 */

import { toPetrinautId } from "../petrinaut-id";
import {
  bindsWithinDocument,
  componentKey,
  resolveComponent,
} from "./interfaces";

import type {
  ArcEndpoint,
  Component,
  ComponentReference,
  ID,
  InputArc,
  OutputArc,
  SDCPN,
} from "../types/sdcpn";
import type { ResolvedLibraries } from "./libraries";

/** An id for what `seed` names. */
type NewId = (seed: string) => ID;

type Inlined = {
  /** The id the component takes in the document. */
  id: ID;
  /** The id each of its places takes, by the id the library gives it. */
  placeIds: ReadonlyMap<ID, ID>;
  component: Component;
};

const mapArcs = <Arc extends InputArc | OutputArc>(
  arcs: Arc[],
  mapEndpoint: (endpoint: ArcEndpoint) => ArcEndpoint,
  mapPlaceId: (placeId: ID) => ID = (placeId) => placeId,
): Arc[] =>
  arcs.map((arc) => ({
    ...arc,
    ...(arc.placeId === undefined ? {} : { placeId: mapPlaceId(arc.placeId) }),
    ...(arc.endpoint === undefined
      ? {}
      : { endpoint: mapEndpoint(arc.endpoint) }),
  }));

/** The component as one of the document's own, its places under their new ids. */
const toComponent = ({ id, placeIds, component }: Inlined): Component => {
  const placeId = (libraryId: ID): ID => placeIds.get(libraryId) ?? libraryId;
  const endpoint = (held: ArcEndpoint): ArcEndpoint =>
    held.kind === "place" ? { ...held, placeId: placeId(held.placeId) } : held;
  return {
    ...component,
    id,
    places: component.places.map((place) => ({
      ...place,
      id: placeId(place.id),
    })),
    transitions: component.transitions.map((transition) => ({
      ...transition,
      inputArcs: mapArcs(transition.inputArcs, endpoint, placeId),
      outputArcs: mapArcs(transition.outputArcs, endpoint, placeId),
    })),
  };
};

/**
 * `sdcpn` with every component of `libraries` that it uses as a component of
 * its own: instances, bindings, arcs and fusions name that component and its
 * ports, and the imports that resolved are no longer listed. A reference
 * that does not resolve is left as it is. Returns `sdcpn` itself when there
 * is nothing to inline.
 *
 * `newId` gives the component and its places their ids. Left out, a component
 * gets the same ids every time, which is what two readers of one document
 * need to agree; an export passes `generatePetrinautId` for ids no other
 * document has.
 */
export const inlineImports = (
  sdcpn: SDCPN,
  libraries: ResolvedLibraries,
  newId: NewId = toPetrinautId,
): SDCPN => {
  const nets = [sdcpn, ...(sdcpn.components ?? [])];
  const instances = nets.flatMap((net) => net.componentInstances ?? []);
  /** What each interface is bound to, by an instance or by the document. */
  const bindings = [
    ...instances.map((instance) => ({
      interface: instance.component,
      component: instance.implementation,
    })),
    ...(sdcpn.implementations ?? []),
  ];

  const inlined = new Map<string, Inlined>();
  for (const reference of bindings.flatMap((binding) => [
    binding.interface,
    binding.component,
  ])) {
    const component =
      reference?.from === undefined
        ? undefined
        : resolveComponent(sdcpn, reference, libraries);
    if (reference && component && !inlined.has(componentKey(reference))) {
      const seed = componentKey(reference);
      inlined.set(seed, {
        id: newId(seed),
        placeIds: new Map(
          component.places.map(({ id }) => [id, newId(`${seed}/${id}`)]),
        ),
        component,
      });
    }
  }

  const listed = sdcpn.imports ?? [];
  const unresolved = listed.filter(({ id }) => !libraries.has(id));
  if (inlined.size === 0 && unresolved.length === listed.length) {
    return sdcpn;
  }

  const moved = (reference: ComponentReference): ComponentReference => {
    const target = inlined.get(componentKey(reference));
    return target ? { id: target.id } : reference;
  };

  // A component of the document says what it implements, where one of a
  // library could not: each binding that crossed a library is written into
  // that list.
  const implemented = new Map<ID, Set<ID>>();
  for (const binding of bindings) {
    if (
      binding.component &&
      !bindsWithinDocument(binding.interface, binding.component)
    ) {
      const [iface, component] = [
        moved(binding.interface),
        moved(binding.component),
      ];
      if (bindsWithinDocument(iface, component)) {
        const interfaces = implemented.get(component.id) ?? new Set();
        interfaces.add(iface.id);
        implemented.set(component.id, interfaces);
      }
    }
  }
  const withImplemented = (component: Component): Component => {
    const added = implemented.get(component.id);
    return added
      ? {
          ...component,
          implements: [...new Set([...(component.implements ?? []), ...added])],
        }
      : component;
  };

  const inlineNet = <Net extends SDCPN | Component>(net: Net): Net => {
    /** The new id of each port of the instances whose component was inlined. */
    const portIds = new Map<ID, ReadonlyMap<ID, ID>>();
    const componentInstances = net.componentInstances?.map((instance) => {
      const target = inlined.get(componentKey(instance.component));
      if (target) {
        portIds.set(instance.id, target.placeIds);
      }
      return {
        ...instance,
        ...(target ? { component: { id: target.id } } : {}),
        ...(instance.implementation
          ? { implementation: moved(instance.implementation) }
          : {}),
      };
    });
    const endpoint = (held: ArcEndpoint): ArcEndpoint =>
      held.kind === "componentPort"
        ? {
            ...held,
            portPlaceId:
              portIds.get(held.componentInstanceId)?.get(held.portPlaceId) ??
              held.portPlaceId,
          }
        : held;
    return {
      ...net,
      ...(componentInstances ? { componentInstances } : {}),
      transitions: net.transitions.map((transition) => ({
        ...transition,
        inputArcs: mapArcs(transition.inputArcs, endpoint),
        outputArcs: mapArcs(transition.outputArcs, endpoint),
      })),
      ...(net.fusions
        ? {
            fusions: net.fusions.map((fusion) => ({
              ...fusion,
              members: fusion.members.map(endpoint),
            })),
          }
        : {}),
    };
  };

  const { imports: _imports, ...root } = inlineNet(sdcpn);
  return {
    ...root,
    ...(unresolved.length > 0 ? { imports: unresolved } : {}),
    components: [
      ...(sdcpn.components ?? []).map(inlineNet),
      ...[...inlined.values()].map(toComponent),
    ].map(withImplemented),
    ...(sdcpn.implementations
      ? {
          implementations: sdcpn.implementations.map((entry) => ({
            interface: moved(entry.interface),
            component: moved(entry.component),
          })),
        }
      : {}),
  };
};
