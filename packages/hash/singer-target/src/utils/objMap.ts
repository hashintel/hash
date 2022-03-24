export function objMap<T, U>(
  template: T,
  eachKey: <P extends keyof T>(value: T[P], name: P) => U,
): { [P in keyof T]: U } {
  // @ts-ignore
  return Object.fromEntries(
    Object.entries(template).map(([name, value]) => {
      // @ts-ignore
      return [name, eachKey(value, name)];
    }),
  );
}
