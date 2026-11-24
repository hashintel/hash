import {
  ARC_ID_PREFIX,
  isSelectionTypeAvailableForExtensions,
  type PetrinautExtensionSettings,
  type SDCPN,
  type SelectionItemType,
} from "@hashintel/petrinaut-core";

/**
 * The lists of a net that hold selectable items, in the order an id is looked
 * for: an id two lists share reads as the first of them.
 */
const itemLists = [
  ["type", (net) => net.types],
  ["parameter", (net) => net.parameters],
  ["differentialEquation", (net) => net.differentialEquations],
  ["place", (net) => net.places],
  ["transition", (net) => net.transitions],
  ["componentInstance", (net) => net.componentInstances ?? []],
  ["fusion", (net) => net.fusions ?? []],
] satisfies [
  SelectionItemType,
  (net: SDCPN | NonNullable<SDCPN["components"]>[number]) => { id: string }[],
][];

/**
 * Answers which kind of item an id names in a document, over the root net
 * and its components. The ids are indexed once, at the first question.
 */
export const createItemTypeLookup = (
  definition: SDCPN,
  extensions: PetrinautExtensionSettings,
): ((id: string) => SelectionItemType | null) => {
  let typeById: Map<string, SelectionItemType> | undefined;

  const indexItems = () => {
    const index = new Map<string, SelectionItemType>();
    const nets = [definition, ...(definition.components ?? [])];
    for (const [type, itemsOf] of itemLists) {
      // An instance is found with the components extension off too.
      if (
        type !== "componentInstance" &&
        !isSelectionTypeAvailableForExtensions(type, extensions)
      ) {
        continue;
      }
      for (const net of nets) {
        for (const { id } of itemsOf(net)) {
          if (!index.has(id)) {
            index.set(id, type);
          }
        }
      }
    }
    return index;
  };

  return (id) => {
    // TODO: Selection and elements IDs should be reworked
    if (id.startsWith(ARC_ID_PREFIX)) {
      return "arc";
    }
    typeById ??= indexItems();
    return typeById.get(id) ?? null;
  };
};
