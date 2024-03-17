export type UndefinedOnPartialShallow<T> = T extends Record<any, any>
  ? {
      [Key in keyof T]: undefined extends T[Key] ? T[Key] | undefined : T[Key];
    }
  : T;

export type PartialOnUndefinedShallow<T> = T extends Record<any, any>
  ? {
      [Key in keyof T as undefined extends T[Key]
        ? Key
        : never]?: T[Key] extends infer U | undefined ? U : never;
    } & {
      [Key in keyof T as undefined extends T[Key] ? never : Key]: T[Key];
    }
  : T;

export function pruneUndefinedShallow<T extends Record<any, any>>(
  value: T,
): PartialOnUndefinedShallow<T> {
  const result: any = {};

  for (const key in value) {
    if (value[key] !== undefined) {
      result[key] = value[key];
    }
  }

  return result;
}

// Taken from:
// <https://github.com/sindresorhus/escape-string-regexp/blob/ba9a4473850cb367936417e97f1f2191b7cc67dd/index.js>
// (Licensed under MIT)
export function escapeStringRegexp(value: string) {
  // Escape characters with special meaning either inside or outside character sets.
  // Use a simple backslash escape when it’s always valid, and a `\xnn` escape when the simpler form would be disallowed by Unicode patterns’ stricter grammar.
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}
