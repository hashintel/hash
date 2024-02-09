export const isValueEmpty = (val: unknown) => {
  if (val === "" || val === undefined) {
    return true;
  }

  if (Array.isArray(val) && !val.length) {
    return true;
  }

  return false;
};
