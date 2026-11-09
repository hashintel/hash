import { type IconName } from "../Icon/icon";

export type SortDirection = "ASCENDING" | "DESCENDING";

export type SortDirectionsAvailable =
  | "none"
  | "ascending"
  | "descending"
  | "both";

export type SortIcon = "alphabetical" | "numeric" | "generic";

export type Sorter<SortKey> = {
  /** Visible label of the sorter in the dropdown — also what the search bar matches, and the trigger label while this sorter is active */
  name: string;
  /** Identifies the sorter in `value` and `onChange` */
  sortKey: SortKey;
  /** Which sort directions the sorter offers. Defaults to "both" */
  directionsAvailable?: SortDirectionsAvailable;
  /**
   * The direction applied when the sorter is picked while another is active, e.g. "DESCENDING" for a date so the
   * newest comes first. Defaults to the first direction available, which is "ASCENDING" when both are
   */
  defaultDirection?: SortDirection;
  /** Glyph family for the direction icons. Defaults to "alphabetical" */
  sortIcon?: SortIcon;
};

const directionIconsBySortIcon: Record<
  SortIcon,
  Record<SortDirection, IconName>
> = {
  alphabetical: {
    ASCENDING: "sortDownAlphabetical",
    DESCENDING: "sortUpAlphabetical",
  },
  numeric: { ASCENDING: "sortDownNumeric", DESCENDING: "sortUpNumeric" },
  generic: { ASCENDING: "sortUp", DESCENDING: "sortDown" },
};

export const directionIcon = (
  sorter: Pick<Sorter<string>, "sortIcon"> | undefined,
  direction: SortDirection,
): IconName =>
  directionIconsBySortIcon[sorter?.sortIcon ?? "alphabetical"][direction];

const directionsByAvailability: Record<
  SortDirectionsAvailable,
  readonly SortDirection[]
> = {
  none: [],
  ascending: ["ASCENDING"],
  descending: ["DESCENDING"],
  both: ["ASCENDING", "DESCENDING"],
};

export const directionsOf = (
  sorter: Sorter<string>,
): readonly SortDirection[] =>
  directionsByAvailability[sorter.directionsAvailable ?? "both"];

/** The direction a sorter starts in when picked: its `defaultDirection` where it offers that, else its first one. */
export const defaultDirectionOf = (sorter: Sorter<string>): SortDirection => {
  const directions = directionsOf(sorter);

  return sorter.defaultDirection && directions.includes(sorter.defaultDirection)
    ? sorter.defaultDirection
    : (directions[0] ?? "ASCENDING");
};

export const flipped = (direction: SortDirection): SortDirection =>
  direction === "ASCENDING" ? "DESCENDING" : "ASCENDING";

const storageKey = (saveSortId: string) => `ds-sort:${saveSortId}`;

export const readSavedSort = (
  saveSortId: string,
): { sortKey: string; direction: SortDirection } | null => {
  try {
    const raw = localStorage.getItem(storageKey(saveSortId));
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const { sortKey, direction } = parsed as {
      sortKey?: unknown;
      direction?: unknown;
    };
    if (
      typeof sortKey !== "string" ||
      (direction !== "ASCENDING" && direction !== "DESCENDING")
    ) {
      return null;
    }
    return { sortKey, direction };
  } catch {
    return null;
  }
};

export const writeSavedSort = (
  saveSortId: string,
  sortKey: string,
  direction: SortDirection,
) => {
  try {
    localStorage.setItem(
      storageKey(saveSortId),
      JSON.stringify({ sortKey, direction }),
    );
  } catch {
    // Persistence is best-effort (storage may be full or unavailable).
  }
};
