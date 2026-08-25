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
    const lastEntry = entries.at(-1);
    if (lastEntry?.speaker === event.speaker) {
      entries[entries.length - 1] = { ...entry, id: lastEntry.id };
      continue;
    }

    entries.push(entry);
  }

  return entries;
};
