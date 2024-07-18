export const stringify = (obj: unknown) =>
  JSON.stringify(
    obj,
    undefined,
    ["test", "development"].includes(process.env.NODE_ENV ?? "")
      ? 2
      : undefined,
  );
