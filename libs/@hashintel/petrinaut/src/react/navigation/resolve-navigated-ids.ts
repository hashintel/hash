import {
  canonicalizeArcId,
  toPetrinautId,
  type SDCPN,
  type SelectionItem,
} from "@hashintel/petrinaut-core";

import type { PetrinautNavigationState } from "./index";

/**
 * A location can name an item by an id that predates its conversion to a
 * UUID: links, published embeds and saved assistant change targets keep the id
 * they were made with. These functions resolve such an id to the one the
 * document holds, as written or converted, so an older link opens the same
 * item.
 */

/** The id in `items` that `requestedId` names, as written or converted, or `null`. */
export const resolveNavigatedId = (
  items: readonly { id: string }[] | undefined,
  requestedId: string,
): string | null => {
  if (items?.some(({ id }) => id === requestedId)) {
    return requestedId;
  }
  const convertedId = toPetrinautId(requestedId);
  return items?.some(({ id }) => id === convertedId) ? convertedId : null;
};

/** `item` with the id the document holds, or `null` when the document has no such item. */
export const resolveNavigatedSelectionItem = (
  item: SelectionItem,
  getItemType: (id: string) => string | null,
): SelectionItem | null => {
  if (getItemType(item.id) === item.type) {
    return item;
  }
  const convertedId =
    item.type === "arc" ? canonicalizeArcId(item.id) : toPetrinautId(item.id);
  return getItemType(convertedId) === item.type
    ? { ...item, id: convertedId }
    : null;
};

type NavigatedItems = Pick<
  PetrinautNavigationState,
  "simulateResource" | "selection"
>;

/**
 * Resolves the location's Simulate resource and selection against the
 * document and drops what the document lacks. Items that resolve as written
 * keep their identity, so an unchanged location compares equal item by item.
 */
export const resolveNavigatedItems = (
  location: NavigatedItems,
  definition: Pick<SDCPN, "scenarios" | "metrics">,
  getItemType: (id: string) => string | null,
): NavigatedItems => {
  const resource = location.simulateResource;
  const resourceId =
    resource?.type === "scenario"
      ? resolveNavigatedId(definition.scenarios, resource.id)
      : resource?.type === "metric"
        ? resolveNavigatedId(definition.metrics, resource.id)
        : (resource?.id ?? null);

  return {
    simulateResource:
      resource === null || resourceId === null
        ? null
        : resourceId === resource.id
          ? resource
          : { ...resource, id: resourceId },
    selection: location.selection.flatMap(
      (item) => resolveNavigatedSelectionItem(item, getItemType) ?? [],
    ),
  };
};
