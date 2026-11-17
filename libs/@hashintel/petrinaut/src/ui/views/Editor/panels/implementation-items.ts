import { implementationsOf, resolveComponent } from "@hashintel/petrinaut-core";

import type { ComponentReference, ID, SDCPN } from "@hashintel/petrinaut-core";

/**
 * The implementations of an interface as the items of a picker. A loaded
 * document may bind a subnet that does not implement the interface: the
 * chosen one stays listed under its name until the choice changes.
 */
export const implementationItems = (
  sdcpn: Pick<SDCPN, "subnets">,
  interfaceId: ID,
  chosen: ComponentReference | undefined,
): { value: ID; text: string }[] => {
  const items = implementationsOf(sdcpn, interfaceId).map(({ id, name }) => ({
    value: id,
    text: name,
  }));
  if (chosen === undefined || items.some(({ value }) => value === chosen.id)) {
    return items;
  }
  return [
    ...items,
    {
      value: chosen.id,
      text: resolveComponent(sdcpn, chosen)?.name ?? "Unknown subnet",
    },
  ];
};
