import {
  componentKey,
  implementationsOf,
  resolveComponent,
  sameComponent,
} from "@hashintel/petrinaut-core";

import type {
  ComponentReference,
  ResolvedLibraries,
  SDCPN,
} from "@hashintel/petrinaut-core";

export type ImplementationItem = {
  /** One string per component, for a picker that holds strings. */
  value: string;
  text: string;
  reference: ComponentReference;
};

/**
 * The implementations of an interface as the items of a picker: the
 * document's own, and with `libraries` those of its imports, each under the
 * name of its library, without the ones `accepts` turns down. A loaded
 * document may bind a component that cannot stand behind the interface, or
 * one `accepts` turns down: the chosen one stays listed under its name until
 * the choice changes.
 */
export const implementationItems = (
  sdcpn: Pick<SDCPN, "components">,
  iface: ComponentReference,
  chosen: ComponentReference | undefined,
  libraries?: ResolvedLibraries,
  accepts: (reference: ComponentReference) => boolean = () => true,
): ImplementationItem[] => {
  const libraryName = ({ from }: ComponentReference) =>
    from === undefined ? undefined : (libraries?.get(from)?.name ?? from);
  const item = (reference: ComponentReference, name: string) => {
    const library = libraryName(reference);
    return {
      value: componentKey(reference),
      text: library === undefined ? name : `${name}, from ${library}`,
      reference,
    };
  };
  const items = implementationsOf(sdcpn, iface, libraries)
    .filter(({ reference }) => accepts(reference))
    .map(({ reference, component }) => item(reference, component.name));
  if (
    chosen === undefined ||
    items.some(({ reference }) => sameComponent(reference, chosen))
  ) {
    return items;
  }
  return [
    ...items,
    item(
      chosen,
      resolveComponent(sdcpn, chosen, libraries)?.name ?? "Unknown component",
    ),
  ];
};
