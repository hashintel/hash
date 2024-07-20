export const isValueEmpty = (value: unknown) => {
  if (value === "" || value === undefined) {
    return true;
  }

  if (Array.isArray(value) && value.length === 0) {
    return true;
  }

  return false;
};
