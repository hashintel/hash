// https://gist.github.com/jsjain/a2ba5d40f20e19f734a53c0aad937fbb
export const isEqual = (first: any, second: any): boolean => {
  if (first === second) {
    return true;
  }
  if (
    (first === undefined ||
      second === undefined ||
      first === null ||
      second === null) &&
    (first || second)
  ) {
    return false;
  }
  const firstType = first?.constructor.name;
  const secondType = second?.constructor.name;
  if (firstType !== secondType) {
    return false;
  }
  if (firstType === "Array") {
    if (first.length !== second.length) {
      return false;
    }
    let equal = true;
    for (let i = 0; i < first.length; i++) {
      if (!isEqual(first[i], second[i])) {
        equal = false;
        break;
      }
    }
    return equal;
  }
  if (firstType === "Object") {
    let equal = true;
    const fKeys = Object.keys(first);
    const sKeys = Object.keys(second);
    if (fKeys.length !== sKeys.length) {
      return false;
    }
    for (let i = 0; i < fKeys.length; i++) {
      const firstField = first[fKeys[i]!];
      const secondField = second[fKeys[i]!];
      if (firstField && secondField) {
        if (firstField === secondField) {
          continue;
        }
        if (
          firstField &&
          (firstField.constructor.name === "Array" ||
            firstField.constructor.name === "Object")
        ) {
          equal = isEqual(firstField, secondField);
          if (!equal) {
            break;
          }
        } else if (firstField !== secondField) {
          equal = false;
          break;
        }
      } else if ((firstField && !secondField) || (!firstField && secondField)) {
        equal = false;
        break;
      }
    }
    return equal;
  }
  return first === second;
};
