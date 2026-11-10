import type { AddNotificationInput } from "../../react/notifications/context";
import type { DocumentKeyPath } from "@hashintel/petrinaut-core";

const formatKeyPath = (path: DocumentKeyPath): string =>
  path.reduce<string>((text, segment) => {
    if (typeof segment === "number") {
      return `${text}[${segment}]`;
    }
    return text === "" ? segment : `${text}.${segment}`;
  }, "");

/** One line per key, where keys that differ only in array positions share a line. */
const listKeys = (unknownKeys: ReadonlyArray<DocumentKeyPath>): string[] => {
  const groups = new Map<string, { first: DocumentKeyPath; count: number }>();
  for (const path of unknownKeys) {
    const shape = JSON.stringify(
      path.map((segment) => (typeof segment === "number" ? null : segment)),
    );
    const group = groups.get(shape);
    groups.set(shape, {
      first: group?.first ?? path,
      count: (group?.count ?? 0) + 1,
    });
  }

  return [...groups.values()].map(({ first, count }) =>
    count === 1
      ? formatKeyPath(first)
      : `${formatKeyPath(first)} (and ${count - 1} more like it)`,
  );
};

/**
 * The notice for an import that left `unknownKeys` out of the net. It stays
 * until it is closed, in the editor the host opens the imported net in.
 */
export const unknownKeysNotice = (
  unknownKeys: ReadonlyArray<DocumentKeyPath>,
): AddNotificationInput => {
  const one = unknownKeys.length === 1;

  return {
    message: one
      ? "1 field in this file was not read"
      : `${unknownKeys.length} fields in this file were not read`,
    detail: [
      `This version of Petrinaut does not know ${one ? "it" : "them"}, so the net was loaded without ${one ? "it" : "them"}. Check the spelling, or open the file in a newer version.`,
      listKeys(unknownKeys).join("\n"),
    ].join("\n\n"),
    tone: "neutral",
    durationMs: Infinity,
    outlivesEditor: true,
  };
};
