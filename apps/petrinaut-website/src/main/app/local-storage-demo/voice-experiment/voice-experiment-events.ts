import type { InterviewCapture } from "./interview-draft";

export type VoiceExperimentEvent =
  | { conversationId?: string; timestampMs: number; type: "connected" }
  | { timestampMs: number; turnId: number; type: "recording-started" }
  | {
      speaker: "assistant" | "expert";
      timestampMs: number;
      transcript: string;
      turnId: number;
      type: "partial-transcript";
    }
  | {
      speaker: "assistant" | "expert";
      timestampMs: number;
      transcript: string;
      turnId: number;
      type: "final-transcript";
    }
  | { timestampMs: number; turnId: number; type: "response-started" }
  | {
      responseText?: string;
      timestampMs: number;
      turnId: number;
      type: "response-completed";
    }
  | {
      argumentSummary: string;
      callId: string;
      capture?: InterviewCapture;
      timestampMs: number;
      toolName: string;
      turnId: number;
      type: "tool-called";
    }
  | {
      revision: number;
      timestampMs: number;
      type: "projection-updated";
    }
  | {
      message: string;
      revision: number;
      timestampMs: number;
      type: "projection-error";
    }
  | {
      callId: string;
      timestampMs: number;
      type: "projection-ready";
    }
  | { message: string; timestampMs: number; type: "error" };
