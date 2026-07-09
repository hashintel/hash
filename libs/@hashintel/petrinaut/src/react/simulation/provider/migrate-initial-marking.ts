import {
  coerceToStoredTokenAttributeValue,
  type Color,
  type InitialMarking,
  type InitialTokenAttributeValue,
  type SDCPN,
} from "@hashintel/petrinaut-core";

type ColorElement = Color["elements"][number];

type TokenRecord = Record<string, InitialTokenAttributeValue>;

/**
 * Lightweight, decoupled snapshot of every colour type's element schema
 * (root types AND subnet types), keyed by type ID. Element objects are
 * copied so later document mutations cannot alias into the snapshot.
 */
export type TypeElementsSnapshot = Map<string, ColorElement[]>;

const collectAllTypes = (sdcpn: SDCPN): Color[] => [
  ...sdcpn.types,
  ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.types),
];

const collectAllPlaces = (sdcpn: SDCPN) => [
  ...sdcpn.places,
  ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.places),
];

export function snapshotTypeElements(sdcpn: SDCPN): TypeElementsSnapshot {
  const snapshot: TypeElementsSnapshot = new Map();
  for (const type of collectAllTypes(sdcpn)) {
    snapshot.set(
      type.id,
      type.elements.map(({ elementId, name, type: elementType }) => ({
        elementId,
        name,
        type: elementType,
      })),
    );
  }
  return snapshot;
}

/**
 * Whether any element known to the previous snapshot was removed, renamed,
 * or re-typed. Pure additions and reorderings return false: token records
 * are name-keyed, so neither needs migration.
 */
const typeElementsNeedMigration = (
  previousElements: readonly ColorElement[],
  nextElements: readonly ColorElement[],
): boolean => {
  const nextById = new Map(
    nextElements.map((element) => [element.elementId, element]),
  );
  for (const previous of previousElements) {
    const next = nextById.get(previous.elementId);
    if (!next || next.name !== previous.name || next.type !== previous.type) {
      return true;
    }
  }
  return false;
};

/**
 * Total coercion of a stored token attribute to `element`'s type. Falls back
 * to the element type's default when coercion throws; `uuid` results are
 * kept as canonical lowercase UUID strings (the JSON-serializable at-rest
 * form the spreadsheet displays).
 */
const coerceStoredValue = (
  element: ColorElement,
  value: unknown,
): InitialTokenAttributeValue =>
  coerceToStoredTokenAttributeValue(
    element,
    value,
    `Initial marking value for element "${element.name}"`,
  );

/**
 * Rebuilds one name-keyed token record against the type's new elements:
 * renamed elements are re-keyed, re-typed elements are coerced, and removed
 * elements' keys (and any stale keys) are dropped. Added elements carry over
 * a value already present under their name (otherwise stay absent — readers
 * fall back to defaults). Returns the original record when nothing changed.
 */
const migrateTokenRecord = (
  record: TokenRecord,
  previousById: ReadonlyMap<string, ColorElement>,
  nextElements: readonly ColorElement[],
): TokenRecord => {
  const migrated: TokenRecord = {};
  for (const element of nextElements) {
    const previous = previousById.get(element.elementId);
    if (!previous) {
      // Added element: carry over an existing value if one is already
      // present under the new name, otherwise leave it absent.
      const existing = record[element.name];
      if (existing !== undefined) {
        migrated[element.name] = existing;
      }
      continue;
    }
    // Prefer the pre-rename key; fall back to the new name so hand-edited
    // or already-normalized records don't lose their value on migration.
    const value = record[previous.name] ?? record[element.name];
    if (previous.type !== element.type) {
      migrated[element.name] = coerceStoredValue(element, value);
    } else if (value !== undefined) {
      migrated[element.name] = value;
    }
  }

  const originalKeys = Object.keys(record);
  const migratedKeys = Object.keys(migrated);
  const unchanged =
    originalKeys.length === migratedKeys.length &&
    migratedKeys.every((key) => record[key] === migrated[key]);
  return unchanged ? record : migrated;
};

/**
 * Migrates a session `initialMarking` after colour type schemas changed
 * (element renamed, re-typed, or removed). Returns the migrated marking, or
 * `null` when nothing needed to change (so callers can skip state updates).
 *
 * Uncoloured (`number`) markings and places whose type schema did not change
 * are left untouched.
 */
export function migrateInitialMarkingForTypeChanges({
  initialMarking,
  previousTypeElements,
  sdcpn,
}: {
  initialMarking: InitialMarking;
  previousTypeElements: TypeElementsSnapshot;
  sdcpn: SDCPN;
}): InitialMarking | null {
  const allPlaces = collectAllPlaces(sdcpn);
  let result: InitialMarking | null = null;

  for (const type of collectAllTypes(sdcpn)) {
    const previousElements = previousTypeElements.get(type.id);
    if (
      !previousElements ||
      !typeElementsNeedMigration(previousElements, type.elements)
    ) {
      continue;
    }
    const previousById = new Map(
      previousElements.map((element) => [element.elementId, element]),
    );

    for (const place of allPlaces) {
      if (place.colorId !== type.id) {
        continue;
      }
      const marking = (result ?? initialMarking)[place.id];
      if (!Array.isArray(marking)) {
        // Absent, or an uncoloured token count.
        continue;
      }
      let placeChanged = false;
      const migratedRecords: TokenRecord[] = [];
      for (const record of marking) {
        const migrated = migrateTokenRecord(
          record,
          previousById,
          type.elements,
        );
        if (migrated !== record) {
          placeChanged = true;
        }
        migratedRecords.push(migrated);
      }
      if (placeChanged) {
        result ??= { ...initialMarking };
        result[place.id] = migratedRecords;
      }
    }
  }

  return result;
}
