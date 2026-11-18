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
 * name of its library. A loaded document may bind a component that cannot
 * stand behind the interface: the chosen one stays listed under its name
 * until the choice changes.
 */
export const implementationItems = (
  sdcpn: Pick<SDCPN, "subnets">,
  iface: ComponentReference,
  chosen: ComponentReference | undefined,
  libraries?: ResolvedLibraries,
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
  const items = implementationsOf(sdcpn, iface, libraries).map(
    ({ reference, subnet }) => item(reference, subnet.name),
  );
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
      resolveComponent(sdcpn, chosen, libraries)?.name ?? "Unknown subnet",
    ),
  ];
};
