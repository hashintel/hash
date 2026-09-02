import {
  ASK_TOOL_NAME,
  parseBrunchAskInput,
} from "@hashintel/brunch-agent/client-tools";

import { hashCanonicalSpeechText } from "../../../canonical-speech-fingerprint";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export { hashCanonicalSpeechText };

export interface CanonicalSpeechSegment {
  readonly contentHash: string;
  readonly id: string;
  readonly messageId: string;
  readonly partId: string;
  readonly source: "assistant-text" | "brunch-ask";
  readonly text: string;
}

export interface InterviewSpeechSource {
  readonly contextSegments: readonly CanonicalSpeechSegment[];
  readonly fullResponseSegments: readonly CanonicalSpeechSegment[];
  readonly messageId: string;
  readonly questionSegment: CanonicalSpeechSegment | null;
}

export interface InterviewSpeechSelection {
  readonly automaticSource: InterviewSpeechSource | null;
  readonly canonicalSegments: readonly CanonicalSpeechSegment[];
}

const createSegment = (
  messageId: string,
  partId: string,
  source: CanonicalSpeechSegment["source"],
  text: string,
): CanonicalSpeechSegment => {
  const contentHash = hashCanonicalSpeechText(text);
  return {
    contentHash,
    id: [
      "canonical-speech",
      encodeURIComponent(messageId),
      encodeURIComponent(partId),
      contentHash,
    ].join(":"),
    messageId,
    partId,
    source,
    text,
  };
};

export const selectInterviewSpeech = (
  messages: PetrinautAiMessage[],
): InterviewSpeechSelection => {
  const canonicalSegments: CanonicalSpeechSegment[] = [];
  let automaticSource: InterviewSpeechSource | null = null;

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    const contextSegments: CanonicalSpeechSegment[] = [];
    const questionSegments: CanonicalSpeechSegment[] = [];

    for (const [partIndex, part] of message.parts.entries()) {
      if (
        part.type === "text" &&
        part.state !== "streaming" &&
        part.text.trim()
      ) {
        const segment = createSegment(
          message.id,
          `text:${partIndex}`,
          "assistant-text",
          part.text,
        );
        canonicalSegments.push(segment);
        contextSegments.push(segment);
        continue;
      }

      if (
        part.type !== "dynamic-tool" ||
        part.toolName !== ASK_TOOL_NAME ||
        part.state !== "input-available"
      ) {
        continue;
      }

      try {
        const input = parseBrunchAskInput(part.input);
        const segment = createSegment(
          message.id,
          part.toolCallId,
          "brunch-ask",
          input.question,
        );
        canonicalSegments.push(segment);
        questionSegments.push(segment);
      } catch {
        // Malformed tool inputs remain visible as tool errors; they are not spoken.
      }
    }

    const questionSegment = questionSegments.at(-1) ?? null;
    if (contextSegments.length > 0 || questionSegment) {
      automaticSource = {
        contextSegments,
        fullResponseSegments: [
          ...contextSegments,
          ...(questionSegment ? [questionSegment] : []),
        ],
        messageId: message.id,
        questionSegment,
      };
    }
  }

  return { automaticSource, canonicalSegments };
};

export const selectCanonicalSpeechSegments = (
  messages: PetrinautAiMessage[],
): CanonicalSpeechSegment[] => [
  ...selectInterviewSpeech(messages).canonicalSegments,
];
