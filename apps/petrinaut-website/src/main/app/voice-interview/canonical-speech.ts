import { getToolName, isToolUIPart } from "ai";

import {
  BRUNCH_QUESTION_DATA_NAME,
  BRUNCH_QUESTION_TOOL_NAME,
  parseBrunchQuestionData,
} from "@hashintel/brunch-agent/question-marker";
import {
  BRUNCH_VOICE_DATA_NAME,
  BRUNCH_VOICE_TOOL_NAME,
  parseBrunchVoiceData,
} from "@hashintel/brunch-agent/voice-response";

import { hashCanonicalSpeechText } from "../../../canonical-speech-fingerprint";

import type { AgentSendResult } from "@flue/sdk";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export { hashCanonicalSpeechText };

export interface CanonicalSpeechSegment {
  readonly contentHash: string;
  readonly id: string;
  readonly messageId: string;
  readonly partId: string;
  readonly source: "assistant-question" | "assistant-text" | "assistant-voice";
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

export const selectCanonicalSpeechSegments = (
  messages: PetrinautAiMessage[],
): CanonicalSpeechSegment[] => selectCanonicalSpeech(messages).segments;

/** Select authored speech, never derive a summary from displayed prose. */
export const selectAuthoredVoiceSpeech = (
  messages: PetrinautAiMessage[],
): CanonicalSpeechSegment[] =>
  messages.flatMap((message) => {
    if (message.role !== "assistant" || message.metadata?.stopped) return [];
    let candidate: CanonicalSpeechSegment | undefined;
    let hasFollowingProse = false;
    for (const part of message.parts) {
      if (
        isToolUIPart(part) &&
        getToolName(part) !== BRUNCH_QUESTION_TOOL_NAME
      ) {
        // A later tool may change the evidence, or replace an earlier speech draft.
        candidate = undefined;
        hasFollowingProse = false;
      }
      if (part.type === `data-${BRUNCH_VOICE_DATA_NAME}`) {
        const speech = parseBrunchVoiceData(part.data);
        const recorded =
          speech &&
          message.parts.some(
            (tool) =>
              isToolUIPart(tool) &&
              getToolName(tool) === BRUNCH_VOICE_TOOL_NAME &&
              tool.toolCallId === speech.toolCallId &&
              tool.state === "output-available",
          );
        candidate =
          speech && recorded
            ? createSegment(
                message.id,
                `voice:${speech.toolCallId}`,
                "assistant-voice",
                speech.speech,
              )
            : undefined;
        hasFollowingProse = false;
      }
      if (part.type === "text") {
        if (part.state === "streaming") return [];
        if (candidate && part.text.trim()) hasFollowingProse = true;
      }
    }
    return candidate && hasFollowingProse ? [candidate] : [];
  });
