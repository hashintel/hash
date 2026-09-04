import {
  BRUNCH_QUESTION_DATA_NAME,
  parseBrunchQuestionData,
} from "@hashintel/brunch-agent/question-marker";

import { hashCanonicalSpeechText } from "../../../canonical-speech-fingerprint";

import type { AgentSendResult } from "@flue/sdk";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export { hashCanonicalSpeechText };

export interface CanonicalSpeechSegment {
  readonly contentHash: string;
  readonly id: string;
  readonly messageId: string;
  readonly partId: string;
  readonly source: "assistant-question" | "assistant-text";
  /**
   * Every Flue submission that wrote to this segment's message: the one that
   * started it plus any client-tool continuation projected back onto it.
   */
  readonly submissionIds?: readonly AgentSendResult["submissionId"][];
  readonly text: string;
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

export const selectCanonicalSpeechSegments = (
  messages: PetrinautAiMessage[],
): CanonicalSpeechSegment[] => selectCanonicalSpeech(messages).segments;

export interface CanonicalSpeechSelection {
  readonly questionSegment?: CanonicalSpeechSegment;
  readonly segments: CanonicalSpeechSegment[];
}

export const selectCanonicalSpeech = (
  messages: PetrinautAiMessage[],
): CanonicalSpeechSelection => {
  const segments: CanonicalSpeechSegment[] = [];
  let questionSegment: CanonicalSpeechSegment | undefined;

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    const finalizedTexts = message.parts.flatMap((part) =>
      part.type === "text" && part.state !== "streaming" && part.text.trim()
        ? [part.text]
        : [],
    );

    for (const [partIndex, part] of message.parts.entries()) {
      if (
        part.type === "text" &&
        part.state !== "streaming" &&
        part.text.trim()
      ) {
        segments.push(
          createSegment(
            message.id,
            `text:${partIndex}`,
            "assistant-text",
            part.text,
          ),
        );
      }
    }

    const questionMarkers = message.parts.flatMap((part) => {
      if (part.type !== `data-${BRUNCH_QUESTION_DATA_NAME}`) {
        return [];
      }

      const marker = parseBrunchQuestionData(part.data);

      return marker &&
        finalizedTexts.some((text) => text.includes(marker.question))
        ? [marker]
        : [];
    });
    const latestQuestionMarker = questionMarkers.at(-1);

    if (latestQuestionMarker) {
      questionSegment = createSegment(
        message.id,
        `question:${latestQuestionMarker.toolCallId}`,
        "assistant-question",
        latestQuestionMarker.question,
      );
    }
  }

  return { questionSegment, segments };
};
