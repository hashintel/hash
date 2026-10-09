import { isValidElement } from "react";
import { describe, expect, test, vi } from "vitest";

import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";

import { BrunchPanelConversationTracker } from "../brunch/brunch-panel-transport";
import { getBrunchVoiceMode } from "./brunch-voice-mode";
import { VoiceInterviewControl } from "./session/voice-interview-control";

describe("getBrunchVoiceMode", () => {
  test("does not install voice on the generic local chat fallback", () => {
    expect(getBrunchVoiceMode(null)).toBeUndefined();
  });

  test("installs the app-owned voice control for a configured Brunch transport", async () => {
    const config = { available: true as const, connectionTimeoutMs: 15_000 };
    const tracker = new BrunchPanelConversationTracker();
    const snapshot = {
      conversationId: "petrinaut-preview:net-1",
      messages: [],
      settlements: [],
    };
    const voiceMode = getBrunchVoiceMode(
      config,
      tracker,
      snapshot.settlements,
      snapshot,
    );
    const renderControl = () =>
      voiceMode?.({
        canAcceptVoiceInput: true,
        conversationId: "petrinaut-preview:net-1",
        inputMode: "text",
        isAiAssistantOpen: true,
        messages: [],
        registerVoiceModeControls: vi.fn(() => () => undefined),
        reportVoiceSessionState: vi.fn(),
        setInputMode: vi.fn(),
        setVoiceActive: vi.fn(),
        status: "ready",
        stop: vi.fn(async () => undefined),
        submitText: vi.fn(async () => ({
          kind: "message" as const,
          messageId: "message-1",
        })),
        submitVoiceInput: vi.fn(async () => ({
          kind: "message" as const,
          messageId: "voice-message-1",
        })),
      });
    const control = renderControl();

    expect(isValidElement(control)).toBe(true);
    if (!isValidElement(control)) {
      throw new Error("Expected the configured composer control to render.");
    }
    expect(control.props).toHaveProperty("snapshot", snapshot);
    let finishSubmission = () => {};
    const pending = tracker.trackSubmission(
      new Promise<void>((resolve) => {
        finishSubmission = resolve;
      }),
    );
    const whilePending = renderControl();
    expect(isValidElement(whilePending) && whilePending.props).toHaveProperty(
      "snapshot",
      snapshot,
    );
    finishSubmission();
    await pending;
    const failureListener = vi.fn();
    const responseCompletedListener = vi.fn();
    const responseStartedListener = vi.fn();
    const stopListener = vi.fn();
    const target = { kind: "user" as const, messageId: "voice-turn-1" };
    const controlProps = control.props as {
      config: typeof config;
      resolveInputSubmission: (messageId: string) => string | undefined;
      resolveResponseSubmission: (
        messageId: string,
      ) => readonly string[] | undefined;
      subscribeToAdmission: (
        admissionTarget: typeof target,
        listener: (submissionId: string) => void,
      ) => () => void;
      subscribeToAdmissionFailure: (
        admissionTarget: typeof target,
        listener: (error: FlueChatAdmissionError) => void,
      ) => () => void;
      subscribeToResponseMessageCompleted: (
        listener: typeof responseCompletedListener,
      ) => () => void;
      subscribeToResponseMessageStarted: (
        listener: typeof responseStartedListener,
      ) => () => void;
      subscribeToStopRequested: (listener: () => void) => () => void;
    };
    expect(control.type).toBe(VoiceInterviewControl);
    expect(controlProps.config).toBe(config);

    const rerenderedControl = renderControl();
    expect(isValidElement(rerenderedControl)).toBe(true);
    if (!isValidElement(rerenderedControl)) {
      throw new Error("Expected the configured composer control to rerender.");
    }
    const rerenderedControlProps =
      rerenderedControl.props as typeof controlProps;
    expect(rerenderedControlProps.resolveInputSubmission).toBe(
      controlProps.resolveInputSubmission,
    );
    expect(rerenderedControlProps.resolveResponseSubmission).toBe(
      controlProps.resolveResponseSubmission,
    );
    expect(rerenderedControlProps.subscribeToAdmission).toBe(
      controlProps.subscribeToAdmission,
    );
    expect(rerenderedControlProps.subscribeToAdmissionFailure).toBe(
      controlProps.subscribeToAdmissionFailure,
    );
    expect(rerenderedControlProps.subscribeToResponseMessageCompleted).toBe(
      controlProps.subscribeToResponseMessageCompleted,
    );
    expect(rerenderedControlProps.subscribeToResponseMessageStarted).toBe(
      controlProps.subscribeToResponseMessageStarted,
    );
    expect(rerenderedControlProps.subscribeToStopRequested).toBe(
      controlProps.subscribeToStopRequested,
    );

    const unsubscribe = controlProps.subscribeToAdmissionFailure(
      target,
      failureListener,
    );
    const unsubscribeFromStop =
      controlProps.subscribeToStopRequested(stopListener);
    const unsubscribeFromResponseCompleted =
      controlProps.subscribeToResponseMessageCompleted(
        responseCompletedListener,
      );
    const unsubscribeFromResponseStarted =
      controlProps.subscribeToResponseMessageStarted(responseStartedListener);
    const admissionError = new FlueChatAdmissionError({ kind: "ambiguous" });

    tracker.recordAdmissionFailure(target, admissionError);
    tracker.recordResponse({
      messageId: "assistant-1",
      position: { batch: 1, index: 0 },
      submissionId: "submission-1",
    });
    tracker.recordResponseMessageCompleted({
      messageId: "assistant-1",
      position: { batch: 1, index: 1 },
      submissionId: "submission-1",
    });
    tracker.recordStopRequested();

    expect(failureListener).toHaveBeenCalledWith(admissionError);
    expect(responseStartedListener).toHaveBeenCalledOnce();
    expect(responseCompletedListener).toHaveBeenCalledOnce();
    expect(stopListener).toHaveBeenCalledOnce();
    unsubscribe();
    unsubscribeFromResponseCompleted();
    unsubscribeFromResponseStarted();
    unsubscribeFromStop();
  });
});
