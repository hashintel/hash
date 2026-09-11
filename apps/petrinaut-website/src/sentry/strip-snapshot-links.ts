export const stripSnapshotLinks = <Value>(value: Value): Value => {
  if (typeof value === "string") {
    return value.replace(
      /(\/share(?:\?[^#\s"]*)?)#[^\s"<>]*/gu,
      "$1#[snapshot]",
    ) as Value;
  }
  if (Array.isArray(value)) return value.map(stripSnapshotLinks) as Value;
  if (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        stripSnapshotLinks(entry),
      ]),
    ) as Value;
  }
  return value;
};
