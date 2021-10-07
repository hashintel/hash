export const compareEntitiesByField = (
  entityA: any,
  entityB: any,
  property: string,
  desc: boolean
): number => {
  let a;
  let b;

  if (desc) {
    a = entityB[property];
    b = entityA[property];
  } else {
    a = entityA[property];
    b = entityB[property];
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
