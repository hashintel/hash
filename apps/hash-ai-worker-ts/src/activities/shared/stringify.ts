export const stringify = (object: unknown) =>
  JSON.stringify(
    object,
    undefined,
    ["test", "development"].includes(process.env.NODE_ENV ?? "")
      ? 2
      : undefined,
  );
