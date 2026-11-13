import { implementationsOf } from "@hashintel/petrinaut-core";

import type { ID, SDCPN } from "@hashintel/petrinaut-core";

/**
 * The implementations of an interface as the items of a picker. A loaded
 * document may bind a subnet that does not implement the interface: the
 * chosen one stays listed under its name until the choice changes.
 */
export const implementationItems = (
  sdcpn: Pick<SDCPN, "subnets">,
  interfaceId: ID,
  chosenId: ID | undefined,
): { value: ID; text: string }[] => {
  const items = implementationsOf(sdcpn, interfaceId).map(({ id, name }) => ({
    value: id,
    text: name,
  }));
  if (chosenId === undefined || items.some(({ value }) => value === chosenId)) {
    return items;
  }
  const chosen = sdcpn.subnets?.find(({ id }) => id === chosenId);
  return [
    ...items,
    { value: chosenId, text: chosen?.name ?? "Unknown subnet" },
  ];
};
