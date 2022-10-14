/** makes it possible to access nested paths (e.g person.location.name)
 */
export const resolvePath = (object: any, path: string, defaultValue?: any) =>
  path
    .split(".")
    .reduce((acc, currVal) => acc?.[currVal] ?? defaultValue, object);

export const compareEntitiesByField = (
  entityA: any,
  entityB: any,
  propertyPath: string,
  desc: boolean,
): number => {
  let a;
  let b;

  if (desc) {
    a = resolvePath(entityB, propertyPath);
    b = resolvePath(entityA, propertyPath);
  } else {
    a = resolvePath(entityA, propertyPath);
    b = resolvePath(entityB, propertyPath);
  }

  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b);
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    // Treat true as 1 and false as 0 as JS does
    return (a ? 1 : 0) - (b ? 1 : 0);
  }

  return (typeof a).localeCompare(typeof b);
};
