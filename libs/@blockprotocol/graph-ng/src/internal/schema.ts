export type UndefinedOnPartialShallow<T> = T extends Record<never, never>
  ? {
      [Key in keyof T]: undefined extends T[Key] ? T[Key] | undefined : T[Key];
    }
  : T;

export type PartialOnUndefinedShallow<T> = T extends Record<never, never>
  ? {
      [Key in keyof T as undefined extends T[Key]
        ? unknown extends T[Key]
          ? never
          : Key
        : never]?: T[Key] extends infer U | undefined ? U : never;
    } & {
      [Key in keyof T as undefined extends T[Key]
        ? unknown extends T[Key]
          ? Key
          : never
        : Key]: T[Key];
    }
  : T;

export function pruneUndefinedShallow<T>(
  value: T,
): PartialOnUndefinedShallow<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {};

  for (const key in value) {
    if (value[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      result[key] = value[key];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
