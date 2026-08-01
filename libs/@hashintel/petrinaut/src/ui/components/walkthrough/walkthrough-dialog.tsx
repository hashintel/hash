import { use, useState } from "react";

import { Button, Dialog } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  WalkthroughContext,
  willShowWalkthroughDialog,
} from "./walkthrough-context";

const docsUrl =
  "https://github.com/hashintel/hash/tree/main/libs/%40hashintel/petrinaut/docs";

const contentClass = css({
  maxWidth: "[680px]",
});

const mediaStyle = css({
  position: "relative",
  width: "full",
  aspectRatio: "[16 / 9]",
  overflow: "hidden",
  backgroundColor: "neutral.s20",
  flexShrink: "[0]",
});

const mediaVideoStyle = css({
  position: "absolute",
  inset: "[0]",
  width: "full",
  height: "full",
  objectFit: "cover",
  display: "block",
});

const stepBlockStyle = css({
  display: "flex",
  flexDirection: "column",
  animation: "petrinautFadeIn 180ms ease-out",
});

const textBlockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingX: "6",
  paddingTop: "[18px]",
  paddingBottom: "5",
  userSelect: "text",
});

const bodyTextStyle = css({
  fontSize: "sm",
  fontWeight: "normal",
  lineHeight: "[1.6]",
  color: "neutral.s115",
  marginTop: "2",
  marginBottom: "[0]",
  marginX: "auto",
  maxWidth: "[64ch]",
  textWrap: "[pretty]",

  "& p + p": {
    marginTop: "3",
  },

  "& strong": {
    fontWeight: "semibold",
  },
});

const footerContentStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  width: "full",
  userSelect: "none",
});

const tertiaryFooterLinkStyle = css({
  color: "neutral.s80 !important",
});

const progressGroupStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
});

const srOnlyStyle = css({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  padding: "[0]",
  margin: "[-1px]",
  overflow: "hidden",
  clip: "[rect(0, 0, 0, 0)]",
  whiteSpace: "nowrap",
  border: "[0]",
});

const dotsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const dotStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "full",
  backgroundColor: "neutral.s70",
  transition: "[background-color 150ms ease, width 150ms ease]",
  padding: "[0]",
  border: "[none]",
  cursor: "pointer",
  "&[data-active=true]": {
    backgroundColor: "neutral.s90",
    width: "[20px]",
  },
});

const dividerStyle = css({
  width: "[1px]",
  height: "[16px]",
  backgroundColor: "neutral.a10",
  flexShrink: "[0]",
});

const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

export type WalkthroughDialogProps = {
  open: boolean;
  onClose: () => void;
};

export const WalkthroughDialog: React.FC<WalkthroughDialogProps> = ({
  open,
  onClose,
}) => {
  const walkthrough = use(WalkthroughContext);
  const [currentStep, setCurrentStep] = useState(0);

  // Reset to the first step every time the dialog opens. Using the
  // prev-prop comparison pattern recommended by React's "you might not need
  // an effect" guide, since calling setState inside useEffect would cause a
  // cascading render and is flagged by react-hooks-js.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCurrentStep(0);
    }
  }

  if (!willShowWalkthroughDialog(walkthrough, open)) return null;

  const { steps } = walkthrough;
  const lastIndex = steps.length - 1;
  const step = steps[currentStep] ?? steps[0];

  if (!step) {
    return null;
  }

  const atFirst = currentStep === 0;
  const atLast = currentStep === lastIndex;

  const goNext = () => {
    if (atLast) {
      onClose();
    } else {
      setCurrentStep((prevStep) => prevStep + 1);
    }
  };

  const goBack = () => {
    if (!atFirst) {
      setCurrentStep((prevStep) => prevStep - 1);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
    }
  };

  return (
    <Dialog
      className={contentClass}
      variant="plain"
      shouldCloseOn="closeButton"
      onClose={onClose}
      onKeyDown={handleKeyDown}
    >
      <Dialog.Header title={step.title} />
      <Dialog.Body withPadding={false}>
        <div key={step.id} className={stepBlockStyle}>
          <div className={mediaStyle}>
            <video
              src={step.videoHref}
              aria-label={step.videoAlt}
              className={mediaVideoStyle}
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
          <div className={textBlockStyle}>
            {typeof step.body === "string" ? (
              <p className={bodyTextStyle}>{step.body}</p>
            ) : (
              <div className={bodyTextStyle}>{step.body}</div>
            )}
          </div>
        </div>
      </Dialog.Body>
      <Dialog.Footer>
        <div className={footerContentStyle}>
          <div className={progressGroupStyle}>
            <span className={srOnlyStyle}>
              Step {currentStep + 1} of {steps.length}
            </span>
            <nav className={dotsStyle} aria-label="Walkthrough steps">
              {steps.map((s, index) => (
                <button
                  key={s.id}
                  type="button"
                  className={dotStyle}
                  data-active={index === currentStep}
                  aria-label={`Go to step ${index + 1}`}
                  aria-current={index === currentStep ? "step" : undefined}
                  onClick={() => setCurrentStep(index)}
                />
              ))}
            </nav>
            <span className={dividerStyle} aria-hidden="true" />
            {atLast ? (
              <Button
                className={tertiaryFooterLinkStyle}
                href={docsUrl}
                target="_blank"
                variant="ghost"
                size="sm"
                iconPosition="right"
              >
                Continue learning
              </Button>
            ) : (
              <Button
                className={tertiaryFooterLinkStyle}
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Skip tour
              </Button>
            )}
          </div>
          <div className={actionsStyle}>
            <Button
              variant="subtle"
              size="sm"
              onClick={goBack}
              disabled={atFirst}
            >
              Back
            </Button>
            <Button
              variant="solid"
              tone={atLast ? "brand" : "neutral"}
              size="sm"
              onClick={goNext}
            >
              {atLast ? "Get started" : "Next"}
            </Button>
          </div>
        </div>
      </Dialog.Footer>
    </Dialog>
  );
};
