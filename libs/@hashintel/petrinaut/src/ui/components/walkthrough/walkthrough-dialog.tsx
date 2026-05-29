import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { use, useState } from "react";

import { Button, usePortalContainerRef } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { WalkthroughContext } from "./walkthrough-context";

const docsUrl =
  "https://github.com/hashintel/hash/tree/main/libs/%40hashintel/petrinaut/docs";

const backdropStyle = css({
  position: "fixed",
  top: "[0]",
  right: "[0]",
  bottom: "[0]",
  left: "[0]",
  backgroundColor: "[rgba(0, 0, 0, 0.4)]",
  zIndex: "sticky",
  "&[data-state=open]": {
    animation: "dialogBackdropIn 150ms ease-out",
  },
  "&[data-state=closed]": {
    animation: "dialogBackdropOut 100ms ease-in",
  },
});

const positionerStyle = css({
  position: "fixed",
  top: "[0]",
  right: "[0]",
  bottom: "[0]",
  left: "[0]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
  zIndex: "sticky",
});

const contentStyle = css({
  width: "[92vw]",
  maxWidth: "[680px]",
  maxHeight: "[min(88vh, 680px)]",
  backgroundColor: "neutral.s10",
  borderRadius: "2xl",
  padding: "1",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  overflow: "clip",
  boxShadow:
    "[0px 0px 1px 0px rgba(0,0,0,0.02), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 6px 6px -3px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.03), 0px 24px 24px -12px rgba(0,0,0,0.02)]",
  "&[data-state=open]": {
    animation: "dialogContentIn 150ms ease-out",
  },
  "&[data-state=closed]": {
    animation: "dialogContentOut 100ms ease-in",
  },
});

const cardStyle = css({
  position: "relative",
  backgroundColor: "neutral.s00",
  borderRadius: "xl",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.08), 0px 12px 32px 0px rgba(0,0,0,0.02)]",
  overflow: "clip",
  display: "flex",
  flexDirection: "column",
  width: "full",
  flex: "[1 1 auto]",
  minHeight: "[0]",
});

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  paddingLeft: "6",
  paddingRight: "3",
  paddingY: "[12px]",
  flexShrink: "[0]",
  borderBottom: "[1px solid {colors.neutral.a10}]",
});

const titleStyle = css({
  fontSize: "[17px]",
  fontWeight: "semibold",
  lineHeight: "[1.25]",
  color: "neutral.fg.heading",
  margin: "[0]",
  letterSpacing: "[-0.005em]",
  minWidth: "[0]",
  flex: "[1 1 auto]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const closeButtonStyle = css({
  flexShrink: "[0]",
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
  flex: "[1 1 auto]",
  minHeight: "[0]",
  animation: "fadeIn 180ms ease-out",
});

const textBlockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingX: "6",
  paddingTop: "[18px]",
  paddingBottom: "5",
  userSelect: "text",
  overflowY: "auto",
  flex: "[1 1 auto]",
  minHeight: "[0]",
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

const footerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  paddingLeft: "6",
  paddingRight: "5",
  paddingY: "[14px]",
  borderTop: "[1px solid {colors.neutral.a10}]",
  flexShrink: "[0]",
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

export const WalkthroughDialog: React.FC = () => {
  const walkthrough = use(WalkthroughContext);
  const [currentStep, setCurrentStep] = useState(0);
  const portalContainerRef = usePortalContainerRef();

  const isOpen = walkthrough?.isOpen ?? false;

  // Reset to the first step every time the dialog opens. Using the
  // prev-prop comparison pattern recommended by React's "you might not need
  // an effect" guide, since calling setState inside useEffect would cause a
  // cascading render and is flagged by react-hooks-js.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setCurrentStep(0);
    }
  }

  if (!walkthrough) {
    return null;
  }

  const { close, steps } = walkthrough;
  const lastIndex = steps.length - 1;
  const step = steps[currentStep] ?? steps[0];

  if (!step) {
    return null;
  }

  const atFirst = currentStep === 0;
  const atLast = currentStep === lastIndex;

  const goNext = () => {
    if (atLast) {
      close();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const goBack = () => {
    if (!atFirst) {
      setCurrentStep(currentStep - 1);
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
    <ArkDialog.Root
      open={isOpen}
      closeOnInteractOutside={false}
      onOpenChange={(details) => {
        if (!details.open) {
          close();
        }
      }}
    >
      <Portal container={portalContainerRef}>
        <ArkDialog.Backdrop className={backdropStyle} />
        <ArkDialog.Positioner className={positionerStyle}>
          <ArkDialog.Content className={contentStyle} onKeyDown={handleKeyDown}>
            <div className={cardStyle}>
              <div className={headerRowStyle}>
                <ArkDialog.Title asChild>
                  <h2 className={titleStyle}>{step.title}</h2>
                </ArkDialog.Title>
                <ArkDialog.CloseTrigger asChild>
                  <Button
                    className={closeButtonStyle}
                    variant="ghost"
                    size="sm"
                    aria-label="Close walkthrough"
                    tooltip="Close"
                    iconName="close"
                  />
                </ArkDialog.CloseTrigger>
              </div>
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
                  <ArkDialog.Description asChild>
                    {typeof step.body === "string" ? (
                      <p className={bodyTextStyle}>{step.body}</p>
                    ) : (
                      <div className={bodyTextStyle}>{step.body}</div>
                    )}
                  </ArkDialog.Description>
                </div>
              </div>
              <div className={footerStyle}>
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
                        aria-label={`Go to step ${index + 1}: ${s.title}`}
                        aria-current={
                          index === currentStep ? "step" : undefined
                        }
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
                      onClick={close}
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
            </div>
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
};
