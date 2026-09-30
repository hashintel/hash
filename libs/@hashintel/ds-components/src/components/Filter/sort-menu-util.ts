import { type IconName } from "../Icon/icon";

export type SortDirection = "ASCENDING" | "DESCENDING";

export type SortDirectionsAvailable =
  | "none"
  | "ascending"
  | "descending"
  | "both";

export type SortIcon = "alphabetical" | "numeric" | "generic";

export type Sorter<SortKey> = {
  name: string;
  sortKey: SortKey;
  /** Defaults to "both" */
  directionsAvailable?: SortDirectionsAvailable;
  /** Glyph family for the direction icons. Defaults to "alphabetical" */
  sortIcon?: SortIcon;
};

const directionIconsBySortIcon: Record<
  SortIcon,
  Record<SortDirection, IconName>
> = {
  alphabetical: { ASCENDING: "sortUpAZ", DESCENDING: "sortDownAZ" },
  numeric: { ASCENDING: "sortUp19", DESCENDING: "sortDown19" },
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
