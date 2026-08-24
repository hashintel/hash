export type VoiceExperimentEvent =
  | { timestampMs: number; type: "connected" }
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
      timestampMs: number;
      toolName: string;
      turnId: number;
      type: "tool-called";
    }
  | { message: string; timestampMs: number; type: "error" };
