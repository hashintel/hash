export function objMapAsync<T, U>(
  template: T,
  eachKey: <P extends keyof T>(value: T[P], name: P) => Promise<U>,
): Promise<{ [P in keyof T]: U }> {
  // @ts-ignore
  return Promise.all(
    Object.entries(template).map(([name, value]) => {
      // @ts-ignore
      return eachKey(value, name).then((mappedTo) => [name, mappedTo]);
    }),
  ).then((entries) => Object.fromEntries(entries));
}
