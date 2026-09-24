import * as Sentry from "@sentry/react";
import { MdBugReport } from "react-icons/md";

import { css } from "@hashintel/ds-helpers/css";
import { definePetrinautPlugin } from "@hashintel/petrinaut/ui";

const feedbackButtonStyle = css({
  backgroundColor: "purple.a85 !important",
  borderColor: "purple.a100 !important",
  color: "white !important",
  _hover: {
    backgroundColor: "purple.a80 !important",
    borderColor: "purple.a85 !important",
  },
});

/**
 * Sentry's feedback widget owns the button's click: it attaches to the DOM
 * node the editor renders, so this runs as the button's ref rather than as a
 * click handler.
 */
const attachSentryFeedback = (node: HTMLButtonElement | null) => {
  if (!node) {
    return;
  }

  const feedback = Sentry.getFeedback();

  if (feedback) {
    return feedback.attachTo(node, {
      formTitle: "Give feedback",
      messagePlaceholder: "Report a bug or suggest an improvement",
      submitButtonLabel: "Submit feedback",
    });
  }

  const showFeedbackUnavailable = () =>
    // eslint-disable-next-line no-alert -- intentional fallback when Sentry is not configured
    window.alert(
      "Sentry is not configured in this environment, so the feedback form is unavailable.",
    );

  node.addEventListener("click", showFeedbackUnavailable);
  return () => node.removeEventListener("click", showFeedbackUnavailable);
};

/** A "Give feedback" button under the canvas zoom controls, opening Sentry's form. */
export const sentryFeedbackPlugin = definePetrinautPlugin({
  id: "website.sentry-feedback",
  name: "Sentry feedback",
  buttons: [
    {
      id: "website.sentry-feedback.give-feedback",
      placement: "viewport-controls",
      label: "Give feedback",
      icon: <MdBugReport size={14} />,
      className: feedbackButtonStyle,
      ref: attachSentryFeedback,
    },
  ],
});
