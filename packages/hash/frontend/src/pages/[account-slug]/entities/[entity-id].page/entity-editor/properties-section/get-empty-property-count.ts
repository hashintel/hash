const isValueEmpty = (val: any) => {
  if (val === "" || val === null || val === undefined) {
    return true;
  }

  if (Array.isArray(val) && !val.length) {
    return true;
  }

  return false;
};

export const getEmptyPropertyCount = (properties: Record<string, any>) => {
  return Object.values(properties).filter(isValueEmpty).length;
};
