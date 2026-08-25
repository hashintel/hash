import type { VoiceExperimentEvent } from "./voice-experiment-events";

export type TranscriptEntry = {
  id: number;
  isPartial: boolean;
  speaker: "assistant" | "expert";
  transcript: string;
  turnId: number;
};

type LoggedTranscriptSource = {
  event: VoiceExperimentEvent;
  sequence: number;
};

export const getTranscriptEntries = (
  events: readonly LoggedTranscriptSource[],
): TranscriptEntry[] => {
  const entries: TranscriptEntry[] = [];
  const partialEntryIndexes = new Map<string, number>();

  for (const { event, sequence } of events) {
    if (
      event.type !== "partial-transcript" &&
      event.type !== "final-transcript"
    ) {
      continue;
    }

    const entry: TranscriptEntry = {
      id: sequence,
      isPartial: event.type === "partial-transcript",
      speaker: event.speaker,
      transcript: event.transcript,
      turnId: event.turnId,
    };
    const partialKey = `${event.turnId}:${event.speaker}`;
    const partialEntryIndex = partialEntryIndexes.get(partialKey);
    if (partialEntryIndex !== undefined) {
      entries[partialEntryIndex] = {
        ...entry,
        id: entries[partialEntryIndex]?.id ?? sequence,
      };
      if (event.type === "final-transcript") {
        partialEntryIndexes.delete(partialKey);
      }
      continue;
    }

    const lastEntry = entries.at(-1);
    if (lastEntry?.speaker === event.speaker) {
      entries[entries.length - 1] = { ...entry, id: lastEntry.id };
      if (event.type === "partial-transcript") {
        partialEntryIndexes.set(partialKey, entries.length - 1);
      }
      continue;
    }

    if (event.type === "partial-transcript") {
      partialEntryIndexes.set(partialKey, entries.length);
    }
    entries.push(entry);
  }

  return entries;
};
