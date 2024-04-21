export const stringify = (obj: unknown) =>
  JSON.stringify(
    obj,
    undefined,
    process.env.NODE_ENV === "development" ? 2 : undefined,
  );
