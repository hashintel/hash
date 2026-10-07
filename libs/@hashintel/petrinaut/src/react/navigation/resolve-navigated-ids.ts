import {
  canonicalizeArcId,
  toPetrinautId,
  type SDCPN,
  type SelectionItem,
} from "@hashintel/petrinaut-core";

import type { PetrinautNavigationState } from "./index";

// Ids resolve as written first: a custom handle may keep ids it never converted.

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

const resolveSelectionItem = (
  item: SelectionItem,
  getItemType: (id: string) => string | null,
): SelectionItem | null => {
  // `getItemType` reads every generated arc id as an arc, so arc ids always convert.
  const id =
    item.type === "arc"
      ? canonicalizeArcId(item.id)
      : getItemType(item.id) === item.type
        ? item.id
        : toPetrinautId(item.id);
  if (getItemType(id) !== item.type) {
    return null;
  }
  return id === item.id ? item : { ...item, id };
};

type NavigatedItems = Pick<
  PetrinautNavigationState,
  "simulateResource" | "selection"
>;

/**
 * The location's Simulate resource and selection with the ids the document
 * holds, without what it lacks. Items that resolve as written keep their
 * identity, so an unchanged location compares equal item by item.
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
      (item) => resolveSelectionItem(item, getItemType) ?? [],
    ),
  };
};
