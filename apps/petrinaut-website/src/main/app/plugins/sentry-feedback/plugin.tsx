/**
 * The website's Sentry feedback button as a plugin: one button in the viewport
 * controls that opens Sentry's feedback form, or explains that Sentry is not
 * configured.
 */

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

/** Attaches Sentry's feedback widget to the button once it is in the DOM. */
const attachFeedback = (node: HTMLButtonElement | null) => {
  if (!node) return;
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

export const sentryFeedbackPlugin = definePetrinautPlugin(
  {
    id: "website.sentry-feedback",
    name: "Sentry feedback",
    description:
      "A button in the viewport controls that opens Sentry's feedback form, to report a bug or suggest an improvement.",
    author: "HASH",
    buttons: {
      giveFeedback: { label: "Give feedback", place: "viewport-controls" },
    },
  },
  () => ({
    buttons: {
      giveFeedback: {
        icon: <MdBugReport size={14} />,
        className: feedbackButtonStyle,
        ref: attachFeedback,
      },
    },
  }),
);
