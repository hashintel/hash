import { useEffect, useRef, useState } from "react";

import { Button, Menu, type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { VoiceTurnSnapshot } from "./voice-turn-controller";

const rootStyle = css({
  display: "flex",
  width: "full",
  flexDirection: "column",
  gap: "2",
  paddingY: "1",
  _focusVisible: {
    outline: "[2px solid currentColor]",
    outlineOffset: "[2px]",
  },
});

const partialBubbleStyle = css({
  display: "flex",
  maxWidth: "[92%]",
  alignSelf: "flex-end",
  alignItems: "flex-start",
  gap: "2",
  paddingX: "3",
  paddingY: "2.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  backgroundColor: "neutral.s20",
  color: "neutral.s100",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "relaxed",
  textAlign: "right",
  transition: "[opacity 120ms ease]",
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
});

const partialTextStyle = css({
  minWidth: "0",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const dividerStyle = css({
  display: "flex",
  minHeight: "[32px]",
  alignItems: "center",
  gap: "2",
  color: "neutral.s80",
});

const dividerLineStyle = css({
  minWidth: "4",
  height: "[1px]",
  flex: "1",
  backgroundColor: "neutral.a20",
});

const statusLabelStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "none",
  whiteSpace: "nowrap",
});

const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const recoveryStyle = css({
  alignSelf: "center",
  paddingX: "3",
  color: "red.s90",
  fontSize: "xs",
  lineHeight: "snug",
  textAlign: "center",
});

const technicalDetailsStyle = css({
  alignSelf: "center",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "snug",
  "& > summary": {
    cursor: "pointer",
    fontWeight: "medium",
  },
  "& > div": {
    display: "grid",
    gridTemplateColumns: "[auto minmax(0, 1fr)]",
    columnGap: "2",
    rowGap: "1",
    paddingTop: "1",
  },
  "& code": {
    overflowWrap: "anywhere",
    userSelect: "text",
  },
});

const visuallyHiddenStyle = css({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  padding: "[0]",
  margin: "[-1px]",
  overflow: "hidden",
  clip: "[rect(0, 0, 0, 0)]",
  whiteSpace: "nowrap",
  borderWidth: "[0]",
});

const waveformStyle = css({
  display: "inline-flex",
  height: "[16px]",
  flexShrink: "0",
  alignItems: "center",
  gap: "[2px]",
  color: "blue.s70",
  "& > span": {
    display: "block",
    width: "[2px]",
    minHeight: "[3px]",
    borderRadius: "full",
    backgroundColor: "[currentColor]",
    transition: "[height 80ms linear, opacity 120ms ease]",
  },
  "@media (prefers-reduced-motion: reduce)": {
    "& > span": {
      transition: "[none]",
    },
  },
});

const speakingWaveformStyle = css({
  "& > span": {
    animationName: "pulse",
    animationDuration: "[900ms]",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "[infinite]",
  },
  "& > span:nth-child(2)": {
    animationDelay: "[120ms]",
  },
  "& > span:nth-child(3)": {
    animationDelay: "[240ms]",
  },
  "& > span:nth-child(4)": {
    animationDelay: "[360ms]",
  },
  "& > span:nth-child(5)": {
    animationDelay: "[480ms]",
  },
  "@media (prefers-reduced-motion: reduce)": {
    "& > span": {
      animationName: "[none]",
    },
  },
});

const provenanceStyle = css({
  height: "[14px]",
  marginTop: "[3px]",
  color: "blue.s70",
});

const waveformBars = [
  { id: "low", multiplier: 0.65 },
  { id: "medium-low", multiplier: 0.9 },
  { id: "high", multiplier: 1.15 },
  { id: "medium-high", multiplier: 0.85 },
  { id: "tail", multiplier: 0.6 },
] as const;

const speakingBarHeights = [6, 11, 15, 9, 5] as const;
const staticBarHeights = [4, 6, 8, 6, 4] as const;

type VoiceWaveformVariant =
  | "connecting"
  | "listening"
  | "paused"
  | "provenance"
  | "speaking";

const VoiceWaveform = ({
  microphoneLevel,
  variant,
}: {
  microphoneLevel: number;
  variant: VoiceWaveformVariant;
}) => {
  const heights =
    variant === "listening"
      ? waveformBars.map(
          (waveformBar) =>
            3 + Math.round(microphoneLevel * waveformBar.multiplier * 12),
        )
      : variant === "speaking"
        ? speakingBarHeights
        : staticBarHeights;

  return (
    <span
      aria-hidden="true"
      className={`${waveformStyle} ${
        variant === "speaking" ? speakingWaveformStyle : ""
      } ${variant === "provenance" ? provenanceStyle : ""}`}
      data-testid={
        variant === "provenance"
          ? "voice-provenance-waveform"
          : "voice-status-waveform"
      }
      data-variant={variant}
    >
      {waveformBars.map((waveformBar, index) => (
        <span key={waveformBar.id} style={{ height: `${heights[index]}px` }} />
      ))}
    </span>
  );
};

const VoiceInputProvenance = () => (
  <span aria-label="Voice input">
    <VoiceWaveform microphoneLevel={0} variant="provenance" />
  </span>
);

type RecoveryErrorFamily = "connection" | "microphone" | "voice";

const recoveryErrorFamily = (
  errorCode: VoiceTurnSnapshot["errorCode"],
): RecoveryErrorFamily => {
  switch (errorCode) {
    case "microphone-permission":
    case "microphone-device":
      return "microphone";
    case "network":
    case "timeout":
    case "request-aborted":
      return "connection";
    default:
      return "voice";
  }
};

const statusLabel = (snapshot: VoiceTurnSnapshot): string => {
  if (snapshot.connection === "connecting") {
    return "Connecting";
  }
  if (snapshot.connection === "error") {
    switch (recoveryErrorFamily(snapshot.errorCode)) {
      case "microphone":
        return "Microphone unavailable";
      case "connection":
        return "Connection interrupted";
      case "voice":
        return "Voice interrupted";
    }
  }
  if (snapshot.input === "paused") {
    return "Paused";
  }
  if (snapshot.output === "speaking") {
    return "Speaking";
  }
  return "Listening";
};

const waveformVariant = (
  snapshot: VoiceTurnSnapshot,
): Exclude<VoiceWaveformVariant, "provenance"> => {
  if (snapshot.connection === "connecting") {
    return "connecting";
  }
  if (snapshot.connection === "error" || snapshot.input === "paused") {
    return "paused";
  }
  if (snapshot.output === "speaking") {
    return "speaking";
  }
  return "listening";
};

const transcriptAnnouncementIntervalMs = 500;

export interface VoiceInterviewControlViewProps {
  readonly committedTextRepresented?: boolean;
  readonly onEnd: () => void;
  readonly onPause: () => void;
  readonly onReconnect: () => void;
  readonly onResume: () => void;
  readonly snapshot: VoiceTurnSnapshot;
}

export const VoiceInterviewControlView = ({
  committedTextRepresented = false,
  onEnd,
  onPause,
  onReconnect,
  onResume,
  snapshot,
}: VoiceInterviewControlViewProps) => {
  const rootRef = useRef<HTMLElement | null>(null);
  const bufferedCommittedText =
    (snapshot.lastAnswerDelivery === "pending" ||
      snapshot.lastAnswerDelivery === "failed") &&
    !committedTextRepresented
      ? snapshot.lastCommittedText
      : "";
  const displayText = snapshot.partialText || bufferedCommittedText;
  const [partialAnnouncement, setPartialAnnouncement] = useState(displayText);
  const announcementTimeoutRef = useRef<
    ReturnType<typeof globalThis.setTimeout> | undefined
  >(undefined);
  const latestAnnouncementTextRef = useRef(displayText);
  const lastAnnouncedTextRef = useRef(displayText);
  const lastAnnouncementAtRef = useRef<number | null>(null);
  const previousConnectionRef = useRef(snapshot.connection);
  const variant = waveformVariant(snapshot);
  const status = statusLabel(snapshot);
  const menuItems: MenuItem[] = [
    ...(snapshot.connection === "connected" && snapshot.input !== "paused"
      ? [
          {
            icon: "pause" as const,
            id: "pause-voice-mode",
            onClick: onPause,
            text: "Pause",
          },
        ]
      : []),
    {
      icon: "close",
      id: "end-voice-mode",
      onClick: onEnd,
      text: "End voice mode",
      tone: "error",
    },
  ];

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    if (lastAnnouncementAtRef.current === null) {
      lastAnnouncementAtRef.current = Date.now();
      return;
    }

    if (previousConnectionRef.current !== snapshot.connection) {
      if (announcementTimeoutRef.current !== undefined) {
        globalThis.clearTimeout(announcementTimeoutRef.current);
        announcementTimeoutRef.current = undefined;
      }
      previousConnectionRef.current = snapshot.connection;
      latestAnnouncementTextRef.current = displayText;
      lastAnnouncedTextRef.current = displayText;
      lastAnnouncementAtRef.current = Date.now();
      announcementTimeoutRef.current = globalThis.setTimeout(() => {
        announcementTimeoutRef.current = undefined;
        const latestText = latestAnnouncementTextRef.current;
        lastAnnouncedTextRef.current = latestText;
        lastAnnouncementAtRef.current = Date.now();
        setPartialAnnouncement(latestText);
      }, 0);
      return;
    }

    if (displayText) {
      latestAnnouncementTextRef.current = displayText;
    }

    const flushLatestAnnouncement = () => {
      if (announcementTimeoutRef.current !== undefined) {
        globalThis.clearTimeout(announcementTimeoutRef.current);
        announcementTimeoutRef.current = undefined;
      }
      const latestText = latestAnnouncementTextRef.current;
      if (!latestText || latestText === lastAnnouncedTextRef.current) {
        return;
      }
      lastAnnouncedTextRef.current = latestText;
      lastAnnouncementAtRef.current = Date.now();
      setPartialAnnouncement(latestText);
    };

    if (!displayText) {
      flushLatestAnnouncement();
      return;
    }

    const elapsedMs = Date.now() - lastAnnouncementAtRef.current;
    if (elapsedMs >= transcriptAnnouncementIntervalMs) {
      flushLatestAnnouncement();
      return;
    }
    if (announcementTimeoutRef.current === undefined) {
      announcementTimeoutRef.current = globalThis.setTimeout(
        flushLatestAnnouncement,
        transcriptAnnouncementIntervalMs - elapsedMs,
      );
    }
  }, [displayText, snapshot.connection]);

  useEffect(
    () => () => {
      if (announcementTimeoutRef.current !== undefined) {
        globalThis.clearTimeout(announcementTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <section
      aria-label="Voice session"
      className={rootStyle}
      ref={rootRef}
      tabIndex={-1}
    >
      {displayText && (
        <div
          className={partialBubbleStyle}
          data-role="user"
          data-testid="voice-partial-bubble"
        >
          <VoiceInputProvenance />
          <span className={partialTextStyle}>{displayText}</span>
        </div>
      )}

      <div className={dividerStyle} data-testid="voice-status-divider">
        <span className={dividerLineStyle} />
        <VoiceWaveform
          microphoneLevel={snapshot.microphoneLevel}
          variant={variant}
        />
        <span className={statusLabelStyle}>{status}</span>
        <span className={dividerLineStyle} />
        <span className={actionsStyle}>
          {snapshot.connection === "connected" &&
            snapshot.input === "paused" && (
              <Button
                aria-label="Resume"
                iconName="play"
                onClick={onResume}
                size="xs"
                type="button"
                variant="solid"
              >
                Resume
              </Button>
            )}
          {snapshot.connection === "error" && (
            <Button
              aria-label="Reconnect"
              iconName="rotate"
              onClick={onReconnect}
              size="xs"
              type="button"
              variant="solid"
            >
              Reconnect
            </Button>
          )}
          <Menu
            items={menuItems}
            position="bottom-end"
            trigger={
              <Button
                aria-label="Voice mode actions"
                iconName="ellipsis"
                size="xs"
                tooltip="Voice mode actions"
                type="button"
                variant="ghost"
              />
            }
          />
        </span>
        <span
          aria-atomic="true"
          aria-label="Voice status"
          aria-live="polite"
          className={visuallyHiddenStyle}
          role="status"
        >
          {`Voice status: ${status}`}
        </span>
      </div>

      {snapshot.connection === "error" && snapshot.errorMessage && (
        <div className={recoveryStyle}>{snapshot.errorMessage}</div>
      )}
      {snapshot.connection === "error" &&
        (snapshot.errorCode !== null || snapshot.errorRequestId) && (
          <details className={technicalDetailsStyle}>
            <summary>Technical details</summary>
            <div>
              {snapshot.errorCode !== null && (
                <>
                  <span>Error code</span>
                  <code>{snapshot.errorCode}</code>
                </>
              )}
              {snapshot.errorRequestId && (
                <>
                  <span>Diagnostic reference</span>
                  <code>{snapshot.errorRequestId}</code>
                </>
              )}
            </div>
          </details>
        )}
      <span
        aria-atomic="true"
        aria-label="Voice transcript"
        aria-live="polite"
        className={visuallyHiddenStyle}
        role="status"
      >
        {partialAnnouncement}
      </span>
    </section>
  );
};
