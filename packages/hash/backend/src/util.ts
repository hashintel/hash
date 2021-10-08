import { Uuid4 } from "id128";

/**
 * Generate a new ID.
 * @todo make ULID. Replace the implementation in datastore/postgres
 * */
export const genId = () => Uuid4.generate().toCanonical().toLowerCase();

/** Get a required environment variable. Throws an error if it's not set. */
export const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
};

/** Returns true if exactly one of items is not null or undefined. */
export const exactlyOne = (...items: any[]): boolean =>
  items
    .map((val) => val !== null && val !== undefined)
    .reduce((acc, val) => (val ? 1 : 0) + acc, 0) === 1;

/** A `Map` which creates a default value if the value for a key is not set. */
export class DefaultMap<K, V> extends Map<K, V> {
  private makeDefault: () => V;

  constructor(makeDefault: () => V) {
    super();
    this.makeDefault = makeDefault;
  }

  get = (key: K) => {
    let value = super.get(key);
    if (value) {
      return value;
    }
    value = this.makeDefault();
    super.set(key, value);
    return value;
  };
}

export const isRecord = (thing: unknown): thing is Record<string, any> => {
  if (typeof thing !== "object") {
    return false;
  }
  if (thing == null) {
    return false;
  }
  if (thing instanceof Array) {
    return false;
  }
  return true;
};
