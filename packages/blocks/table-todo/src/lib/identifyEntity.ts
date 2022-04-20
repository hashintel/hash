export const isRecord = (thing: unknown): thing is Record<string, any> => {
  if (typeof thing !== "object") {
    return false;
  }
  if (thing === null) {
    return false;
  }
  if (thing instanceof Array) {
    return false;
  }
  return true;
};

/**
 * Given an object and a nested property accessor string (e.g. "employer.name"),
 * returns the entity that the property directly belongs to.
 * i.e. the closest parent of the property that has an id and a type.
 * and the accessor string for the target property on that entity.
 * N.B. the accessor string may still be nested if the entity owns objects.
 */
export const identityEntityAndProperty = (
  tree: Record<string, any>,
  dotKey: string,
) => {
  const accessorKeys = dotKey.split(".");
  let finalKeys = accessorKeys;

  let entity = tree;
  let nextObject = tree;

  for (let i = 0; i < accessorKeys.length; i++) {
    const key = accessorKeys[i]!;
    const nextValue = nextObject[key];
    if (isRecord(nextValue)) {
      nextObject = nextValue;
      if (nextObject.id && nextObject.type) {
        entity = nextObject;
        finalKeys = accessorKeys.slice(i + 1);
      }
    }
  }

  const property = finalKeys.join(".");

  return { entity, property };
};
