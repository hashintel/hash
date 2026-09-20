/**
 * The example URL contract: scenario, subnet, and a single focused item.
 *
 * Deliberately free of React and of the Petrinaut editor: the canonical page,
 * the embed page, and the oEmbed server function all speak this one contract,
 * and the server function must not bundle the editor to do so.
 */
import { z } from "zod";

import {
  selectionItemTypes,
  type SelectionItem,
  type SelectionItemType,
} from "@hashintel/petrinaut-core/selection";

/**
 * The editor's mode, its Simulate section, and the overlay it has open, spelled
 * for a URL.
 *
 * Declared here rather than imported so this module stays free of the editor:
 * the oEmbed server function speaks the same contract and must not bundle it.
 * `navigation-search.ts` maps each of these onto the editor's own vocabulary
 * with an exhaustive switch, so a rename on either side fails to compile.
 */
export const sharedModes = ["edit", "simulate", "actual"] as const;

export const sharedEditViews = ["canvas", "definitions"] as const;

/**
 * Whether an editor edit view is one the URL contract carries. Plugins name
 * their own edit views, so this is a runtime check rather than a type.
 */
export const isSharedEditView = (view: string): view is SharedEditView =>
  (sharedEditViews as readonly string[]).includes(view);

export const sharedSimulateViews = [
  "scenarios",
  "metrics",
  "experiments",
] as const;

export const sharedOverlays = [
  "user-settings",
  "viewport-settings",
  "create-scenario",
  "create-metric",
  "create-experiment",
] as const;

export const sharedSettingsSections = ["general", "viewport", "labs"] as const;

export const sharedResourceTypes = [
  "scenario",
  "metric",
  "experiment",
] as const;

export type SharedEditView = (typeof sharedEditViews)[number];
export type SharedMode = (typeof sharedModes)[number];
export type SharedSimulateView = (typeof sharedSimulateViews)[number];
export type SharedOverlay = (typeof sharedOverlays)[number];

/**
 * Search params understood by every example surface. A URL carries at most one
 * focused item: multi-selection is in-app state, not a shareable location.
 *
 * A field the URL leaves out means "whatever this page starts from", which for
 * every page but `/brunch` is the editor's own default. That is what lets Back
 * undo a mode change or close an overlay: the entry it returns to simply does
 * not name the field.
 */
export type SharedExampleSearch = {
  scenario?: string;
  subnet?: string;
  itemType?: SelectionItemType;
  itemId?: string;
  mode?: SharedMode;
  editView?: SharedEditView;
  view?: SharedSimulateView;
  overlay?: SharedOverlay;
  settings?: (typeof sharedSettingsSections)[number];
  expandedPanel?: string;
  expandedSection?: string;
  resourceType?: (typeof sharedResourceTypes)[number];
  resourceId?: string;
  presentation?: "fullscreen";
};

/** The keys this contract owns. Anything else in a URL is foreign. */
const sharedSearchKeys = [
  "scenario",
  "subnet",
  "itemType",
  "itemId",
  "mode",
  "editView",
  "view",
  "overlay",
  "settings",
  "expandedPanel",
  "expandedSection",
  "resourceType",
  "resourceId",
  "presentation",
] as const satisfies readonly (keyof SharedExampleSearch)[];

// `.catch(undefined)` is the contract's whole validation story: anything a URL
// can carry that is not a usable value simply drops out.
const optionalNonEmptyString = z.string().min(1).optional().catch(undefined);

const optionalSelectionItemType = z
  .enum(selectionItemTypes)
  .optional()
  .catch(undefined);

const optionalEditView = z.enum(sharedEditViews).optional().catch(undefined);
const optionalMode = z.enum(sharedModes).optional().catch(undefined);
const optionalSimulateView = z
  .enum(sharedSimulateViews)
  .optional()
  .catch(undefined);
const optionalOverlay = z.enum(sharedOverlays).optional().catch(undefined);

/** The focused item, when the URL names a complete one. */
export const selectionFromInput = (
  input: Record<string, unknown>,
): readonly SelectionItem[] => {
  const itemType = optionalSelectionItemType.parse(input.itemType);
  const itemId = optionalNonEmptyString.parse(input.itemId);
  return itemType && itemId ? [{ type: itemType, id: itemId }] : [];
};

/** Encodes a selection of exactly one item; anything else carries no item. */
export const selectionToSearch = (
  selection: readonly SelectionItem[],
): Pick<SharedExampleSearch, "itemId" | "itemType"> => {
  const item = selection.length === 1 ? selection[0] : undefined;
  return item ? { itemType: item.type, itemId: item.id } : {};
};

/**
 * Decodes arbitrary input into the contract, dropping anything it cannot
 * represent. Also the normalizer: its output is the canonical spelling of a
 * location.
 */
export const validateSharedExampleSearch = (
  input: Record<string, unknown>,
): SharedExampleSearch => {
  const resourceType = z
    .enum(sharedResourceTypes)
    .optional()
    .catch(undefined)
    .parse(input.resourceType);
  const resourceId = optionalNonEmptyString.parse(input.resourceId);
  const hasResource = resourceType !== undefined && resourceId !== undefined;
  const canExpand =
    (hasResource && resourceType !== "metric") ||
    input.overlay === "create-scenario" ||
    input.overlay === "create-experiment";

  return {
    scenario: optionalNonEmptyString.parse(input.scenario),
    subnet: optionalNonEmptyString.parse(input.subnet),
    mode: input.mode === "notebook" ? "edit" : optionalMode.parse(input.mode),
    editView:
      input.mode === "notebook"
        ? "definitions"
        : optionalEditView.parse(
            input.editView === "notebook" ? "definitions" : input.editView,
          ),
    view: optionalSimulateView.parse(input.view),
    overlay: optionalOverlay.parse(input.overlay),
    expandedPanel: optionalNonEmptyString.parse(input.expandedSection)
      ? optionalNonEmptyString.parse(input.expandedPanel)
      : undefined,
    expandedSection: optionalNonEmptyString.parse(input.expandedPanel)
      ? optionalNonEmptyString.parse(input.expandedSection)
      : undefined,
    settings:
      input.overlay === "user-settings"
        ? z
            .enum(sharedSettingsSections)
            .optional()
            .catch(undefined)
            .parse(input.settings)
        : undefined,
    ...selectionToSearch(selectionFromInput(input)),
    resourceType: hasResource ? resourceType : undefined,
    resourceId: hasResource ? resourceId : undefined,
    presentation:
      canExpand && input.presentation === "fullscreen"
        ? "fullscreen"
        : undefined,
  };
};

/** Canonical query string for a validated search: sorted, contract keys only. */
export const canonicalSearchString = (search: SharedExampleSearch): string => {
  const params = new URLSearchParams();
  for (const key of sharedSearchKeys) {
    const value = search[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  params.sort();
  return params.toString();
};

/** Two searches are the same location when their canonical strings agree. */
export const sharedSearchesMatch = (
  left: SharedExampleSearch,
  right: SharedExampleSearch,
): boolean => canonicalSearchString(left) === canonicalSearchString(right);
