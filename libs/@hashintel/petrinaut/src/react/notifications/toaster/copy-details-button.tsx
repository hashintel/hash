import { useEffect, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";

const COPY_FEEDBACK_DURATION_MS = 2000;
const copyStatusPresentation = {
  idle: { iconName: "copy", label: "Copy details" },
  copied: { iconName: "check", label: "Copied" },
  failed: { iconName: "warning", label: "Copy failed" },
} as const;

type CopyStatus = keyof typeof copyStatusPresentation;

const copyTextWithDocument = (text: string) => {
  if (typeof document.execCommand !== "function") {
    return false;
  }

  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.readOnly = true;
  textArea.tabIndex = -1;
  textArea.style.position = "fixed";
  textArea.style.inset = "0 auto auto -9999px";
  textArea.style.opacity = "0";

  try {
    document.body.append(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
    activeElement?.focus();
  }
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyTextWithDocument(text);
  }
};

export const CopyDetailsButton = ({
  className,
  detail,
}: {
  className: string;
  detail: string;
}) => {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(feedbackTimeout.current);
    },
    [],
  );

  const showFeedback = (nextStatus: Exclude<CopyStatus, "idle">) => {
    clearTimeout(feedbackTimeout.current);
    setStatus(nextStatus);
    feedbackTimeout.current = setTimeout(() => {
      feedbackTimeout.current = undefined;
      setStatus("idle");
    }, COPY_FEEDBACK_DURATION_MS);
  };

  const { iconName, label } = copyStatusPresentation[status];

  return (
    <Button
      aria-label={label}
      className={className}
      iconName={iconName}
      onClick={() => {
        void copyText(detail).then(
          (copied) => showFeedback(copied ? "copied" : "failed"),
          () => showFeedback("failed"),
        );
      }}
      size="xs"
      tooltip={label}
      variant="ghost"
    />
  );
};
