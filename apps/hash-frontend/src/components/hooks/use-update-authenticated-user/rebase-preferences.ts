import { isEqual } from "lodash";

import type { UserPreferences } from "../../../shared/use-user-preferences";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Stands in for a missing base object, and is only ever read from. */
const emptyRecord: Record<string, unknown> = {};

/**
 * Treat arrays as sets – the only array in the preferences is the list of
 * favorites, whose order carries no meaning (it is sorted for display).
 */
const rebaseArray = (
  base: unknown[],
  next: unknown[],
  latest: unknown[],
): unknown[] => {
  const removedByCaller = base.filter(
    (item) => !next.some((nextItem) => isEqual(nextItem, item)),
  );
  const addedByCaller = next.filter(
    (item) => !base.some((baseItem) => isEqual(baseItem, item)),
  );

  const kept = latest.filter(
    (item) => !removedByCaller.some((removed) => isEqual(removed, item)),
  );

  return [
    ...kept,
    ...addedByCaller.filter(
      (item) => !kept.some((keptItem) => isEqual(keptItem, item)),
    ),
  ];
};

const rebaseValue = (
  base: unknown,
  next: unknown,
  latest: unknown,
): unknown => {
  if (isEqual(next, base)) {
    /**
     * The caller did not change this, so anything which landed on the server in
     * the meantime is newer than what they sent.
     */
    return latest;
  }

  if (Array.isArray(next) && Array.isArray(latest)) {
    return rebaseArray(Array.isArray(base) ? base : [], next, latest);
  }

  if (isPlainObject(next) && isPlainObject(latest)) {
    const baseObject = isPlainObject(base) ? base : emptyRecord;
    const rebased: Record<string, unknown> = {};

    for (const key of new Set([...Object.keys(latest), ...Object.keys(next)])) {
      if (!(key in next)) {
        /**
         * The caller dropped a key they had, or the server has one they never
         * saw – keep the server's in the latter case only.
         */
        if (!(key in baseObject)) {
          rebased[key] = latest[key];
        }
        continue;
      }

      if (!(key in latest)) {
        /**
         * The server dropped the key. The caller's value only wins if they
         * changed it.
         */
        if (!isEqual(next[key], baseObject[key])) {
          rebased[key] = next[key];
        }
        continue;
      }

      rebased[key] = rebaseValue(baseObject[key], next[key], latest[key]);
    }

    return rebased;
  }

  /**
   * A leaf, or a change of shape: the caller changed it, so their value wins.
   */
  return next;
};

/**
 * Preferences are stored as a single property on the user entity, so a caller
 * which builds `next` by spreading the preferences it last rendered will
 * overwrite anything which landed in between – including an update of its own
 * which was still in flight.
 *
 * Re-apply only what the caller actually changed (`next` compared with the
 * `base` they built it from) on top of the preferences which are on the server
 * now (`latest`).
 */
export const rebaseUserPreferences = ({
  base,
  next,
  latest,
}: {
  base: UserPreferences | undefined;
  next: UserPreferences;
  latest: UserPreferences | undefined;
}): UserPreferences => {
  if (!latest) {
    return next;
  }

  return rebaseValue(base, next, latest) as UserPreferences;
};
