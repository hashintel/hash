import {
  parsePetrinautUserMessageBody,
  readPetrinautSubmissionContext,
  type VersionLoad,
} from "@hashintel/brunch-agent";

import type { ContextProjection, ContextProjectionEntry } from "@flue/runtime";

/** What the model reads on the turn after the user loaded another saved version. */
export const versionLoadNote = ({ decisionTime }: VersionLoad): string =>
  `Host note: The user loaded the version saved at ${decisionTime}; later saves build on it.`;

const textsOf = (entry: ContextProjectionEntry): string[] => {
  const { message } = entry;
  if (message.role !== "user") return [];
  return typeof message.content === "string"
    ? [message.content]
    : message.content.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      );
};

/** The version load a user turn's host context carries, if any. */
const versionLoadOf = (
  entry: ContextProjectionEntry,
): VersionLoad | undefined => {
  for (const text of textsOf(entry)) {
    const { versionLoad } = readPetrinautSubmissionContext(
      parsePetrinautUserMessageBody(text),
    );
    if (versionLoad) return versionLoad;
  }
  return undefined;
};

const withNote = (
  entry: ContextProjectionEntry,
  note: string,
): ContextProjectionEntry => {
  const { message } = entry;
  if (message.role !== "user") return entry;
  if (typeof message.content === "string")
    return {
      ...entry,
      message: { ...message, content: `${note}\n\n${message.content}` },
    };
  const first = message.content.findIndex((part) => part.type === "text");
  return {
    ...entry,
    message: {
      ...message,
      content:
        first === -1
          ? [{ type: "text", text: note }, ...message.content]
          : message.content.map((part, index) =>
              index === first && part.type === "text"
                ? { ...part, text: `${note}\n\n${part.text}` }
                : part,
            ),
    },
  };
};

/**
 * Wrap a projection so the first user turn carrying each new version load
 * tells the model which version the user loaded. Every turn after a load
 * carries the same load; only the first in history gains the note, so it
 * stays where the load happened and later turns gain none. Derived from the
 * entries alone: a Save never sets a load, and a host that sends none gets
 * the wrapped projection unchanged.
 */
export const withVersionLoadNotes =
  (projection: ContextProjection): ContextProjection =>
  (entries) => {
    const projected = projection(entries);
    let announced: string | undefined;
    return projected.map((entry, index) => {
      const source = entries[index];
      const versionLoad =
        source?.message.role === "user" ? versionLoadOf(source) : undefined;
      if (versionLoad === undefined || versionLoad.id === announced)
        return entry;
      announced = versionLoad.id;
      return withNote(entry, versionLoadNote(versionLoad));
    });
  };
