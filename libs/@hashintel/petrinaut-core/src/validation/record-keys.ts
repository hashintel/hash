import type { SDCPN } from "../types/sdcpn";

/**
 * Guards for records keyed by user-authored strings.
 *
 * Net definitions arrive from imported files, so every id, parameter variable
 * name and colour element name is untrusted. Used as plain-object keys they
 * collide with `Object.prototype`: writing `record["__proto__"] = value`
 * replaces the record's prototype instead of adding a property, and reading a
 * missing key such as `record["constructor"]` returns an inherited function
 * instead of `undefined`.
 *
 * Three defences, used together:
 *
 * 1. `createUserKeyedRecord` builds records with no prototype, so any key is
 *    an ordinary own property.
 * 2. `getOwn` reads only own properties, for records whose provenance is not
 *    controlled here (`structuredClone` and `JSON.parse` both revive plain
 *    objects, so a null prototype does not survive a worker hop).
 * 3. `findDangerousSdcpnKeys` rejects the keys outright at the file-import
 *    and simulation boundaries.
 */

/**
 * `Object.prototype` member names, plus `prototype`.
 *
 * A fixed list rather than `Object.getOwnPropertyNames(Object.prototype)`:
 * what a file format accepts must not depend on the running environment.
 */
export const DANGEROUS_RECORD_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "toLocaleString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

export const isDangerousRecordKey = (key: string): boolean =>
  DANGEROUS_RECORD_KEYS.has(key);

/**
 * A `Record` with no prototype. Safe to write user-authored keys into:
 * `__proto__` is an ordinary property and reads of missing keys return
 * `undefined`.
 */
export const createUserKeyedRecord = <T>(): Record<string, T> =>
  Object.create(null) as Record<string, T>;

/**
 * Own-property read of a user-keyed record. Use for records that may have a
 * normal prototype (revived from `JSON.parse` or `structuredClone`), where a
 * missing key would otherwise return an `Object.prototype` member. A missing
 * record reads as a missing key.
 */
export const getOwn = <T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined =>
  record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;

/**
 * Copies a record's own enumerable entries into a prototype-free record.
 * Use when a record of user-authored keys arrives from outside: spreading
 * onto `{}` keeps `Object.prototype`, and assigning into it goes through
 * the `__proto__` setter.
 */
export const cloneUserKeyedRecord = <T>(
  source: Readonly<Record<string, T>>,
): Record<string, T> => Object.assign(createUserKeyedRecord<T>(), source);

export type DangerousSdcpnKey = {
  /** Human-readable location, e.g. `transition id` or `parameter variable name`. */
  location: string;
  key: string;
};

const check = (
  found: DangerousSdcpnKey[],
  location: string,
  key: string,
): void => {
  if (isDangerousRecordKey(key)) {
    found.push({ location, key });
  }
};

const collectNetKeys = (
  found: DangerousSdcpnKey[],
  net: Pick<
    SDCPN,
    "places" | "transitions" | "types" | "differentialEquations" | "parameters"
  > &
    Partial<Pick<SDCPN, "componentInstances">>,
  scope: string,
): void => {
  for (const place of net.places) {
    check(found, `${scope}place id`, place.id);
  }
  for (const transition of net.transitions) {
    check(found, `${scope}transition id`, transition.id);
  }
  for (const type of net.types) {
    check(found, `${scope}colour id`, type.id);
    for (const element of type.elements) {
      check(found, `${scope}colour element name`, element.name);
    }
  }
  for (const equation of net.differentialEquations) {
    check(found, `${scope}differential equation id`, equation.id);
  }
  for (const parameter of net.parameters) {
    check(found, `${scope}parameter id`, parameter.id);
    check(found, `${scope}parameter variable name`, parameter.variableName);
  }
  for (const instance of net.componentInstances ?? []) {
    check(found, `${scope}component instance id`, instance.id);
  }
};

/**
 * Collects every identity string of an SDCPN (ids, parameter variable names,
 * colour element names) that would collide with `Object.prototype` when used
 * as a record key. Empty result means the definition is safe to key records
 * by.
 */
export const findDangerousSdcpnKeys = (sdcpn: SDCPN): DangerousSdcpnKey[] => {
  const found: DangerousSdcpnKey[] = [];

  collectNetKeys(found, sdcpn, "");

  for (const metric of sdcpn.metrics ?? []) {
    check(found, "metric id", metric.id);
  }
  for (const scenario of sdcpn.scenarios ?? []) {
    check(found, "scenario id", scenario.id);
    for (const parameter of scenario.scenarioParameters) {
      check(found, "scenario parameter identifier", parameter.identifier);
    }
  }
  for (const subnet of sdcpn.subnets ?? []) {
    check(found, "subnet id", subnet.id);
    collectNetKeys(found, subnet, `subnet "${subnet.id}" `);
  }

  return found;
};

/** Formats `findDangerousSdcpnKeys` results into one error sentence. */
export const describeDangerousSdcpnKeys = (
  found: readonly DangerousSdcpnKey[],
): string =>
  `The net uses reserved JavaScript property names as identifiers: ${found
    .map((entry) => `${entry.location} "${entry.key}"`)
    .join(", ")}. Rename them before running.`;
