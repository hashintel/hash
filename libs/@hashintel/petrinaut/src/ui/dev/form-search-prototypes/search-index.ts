/**
 * The searchable-name index the form-search prototypes share, and the jump
 * that lands on a result. Entries are derived from the same state and
 * context the form renders, and each carries the aria-label of the button
 * that IS that thing in the form (the `adHocTargetLabel` conventions), so a
 * jump is: find the labelled trigger, scroll it into view, focus it — focus
 * being selection in the worksheet model — and flash it.
 */

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

export type SearchEntryKind =
  | "parameter"
  | "variable"
  | "place variable"
  | "place";

export type SearchEntry = {
  kind: SearchEntryKind;
  /** What the user searches against, e.g. `Space › distance`. */
  text: string;
  /** Secondary line: type, place, current expression. */
  detail: string;
  /** The aria-label of the form trigger this entry jumps to. */
  ariaLabel: string;
};

const KIND_ORDER: SearchEntryKind[] = [
  "parameter",
  "variable",
  "place variable",
  "place",
];

export function kindRank(kind: SearchEntryKind): number {
  return KIND_ORDER.indexOf(kind);
}

/** Every searchable thing in the form, in stable kind-grouped order. */
export function buildSearchIndex(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const parameter of context.netParameters) {
    const override = state.netParameters.find(
      (candidate) => candidate.parameterId === parameter.id,
    );
    entries.push({
      kind: "parameter",
      text: parameter.name,
      detail: override?.expression
        ? `override: ${override.expression}`
        : `default ${parameter.defaultValue}`,
      ariaLabel: parameter.name,
    });
  }

  for (const variable of state.variables) {
    entries.push({
      kind: "variable",
      text: variable.name,
      detail: `${variable.type} · ${variable.expression || "(empty)"}`,
      ariaLabel: variable.name,
    });
  }

  for (const place of context.places) {
    const placeState = state.places[place.id];
    if (placeState?.kind === "coloured") {
      for (const variable of placeState.variables) {
        entries.push({
          kind: "place variable",
          text: `${place.name} › ${variable.name}`,
          detail: `${variable.type} · ${variable.expression || "(empty)"}`,
          ariaLabel: `${place.name} › ${variable.name}`,
        });
      }
    }
    const coloured = place.colorId !== null;
    entries.push({
      kind: "place",
      text: place.name,
      detail: coloured
        ? `coloured place · ${placeState?.kind === "coloured" ? placeState.rows.length : 0} rows`
        : "uncoloured place",
      ariaLabel: coloured ? `${place.name} place` : `${place.name} › count`,
    });
  }

  return entries;
}

/** The flash the jump leaves behind, so the landing spot is unmissable. */
const FLASH_OUTLINE = "2px solid rgb(217 119 6)";

/**
 * Finds the entry's trigger inside `root`, scrolls to it, focuses it, and
 * flashes it. Returns false when no trigger carries the label (a collapsed
 * region, or a label drift).
 */
export function jumpToEntry(root: HTMLElement, entry: SearchEntry): boolean {
  const target = root.querySelector<HTMLElement>(
    `[aria-label="${entry.ariaLabel.replaceAll('"', '\\"')}"]`,
  );
  if (!target) {
    return false;
  }
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.focus({ preventScroll: true });
  const previousOutline = target.style.outline;
  const previousOffset = target.style.outlineOffset;
  target.style.outline = FLASH_OUTLINE;
  target.style.outlineOffset = "2px";
  window.setTimeout(() => {
    target.style.outline = previousOutline;
    target.style.outlineOffset = previousOffset;
  }, 900);
  return true;
}

/**
 * All form triggers whose aria-label is NOT in the given set, for the
 * dim-the-rest prototype: the caller dims each one's enclosing row.
 */
export function triggerElements(
  root: HTMLElement,
  ariaLabels: ReadonlySet<string>,
): { matching: HTMLElement[]; other: HTMLElement[] } {
  const matching: HTMLElement[] = [];
  const other: HTMLElement[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    "button[aria-label]",
  )) {
    const label = element.getAttribute("aria-label")!;
    (ariaLabels.has(label) ? matching : other).push(element);
  }
  return { matching, other };
}
