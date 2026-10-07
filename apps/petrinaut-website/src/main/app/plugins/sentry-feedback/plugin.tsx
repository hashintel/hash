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

/** Makes the button open Sentry's feedback form, as configured in `instrument.ts`. */
const attachFeedback = (node: HTMLButtonElement | null) => {
  if (!node) {
    return;
  }
  return Sentry.getFeedback()?.attachTo(node);
};

const alertIfFeedbackUnavailable = () => {
  if (!Sentry.getFeedback()) {
    // eslint-disable-next-line no-alert -- intentional fallback when Sentry is not configured
    window.alert(
      "Sentry is not configured in this environment, so the feedback form is unavailable.",
    );
  }
};

/** A viewport button that opens Sentry's feedback form. */
export const sentryFeedbackPlugin = definePetrinautPlugin({
  id: "website.sentry-feedback",
  name: "Sentry feedback",
  description:
    "A button under the viewport controls that opens Sentry's feedback form, to report a bug or suggest an improvement.",
  author: "HASH",
  buttons: {
    giveFeedback: { label: "Give feedback", place: "viewport-controls" },
  },
})({
  buttons: {
    giveFeedback: {
      icon: <MdBugReport size={14} />,
      className: feedbackButtonStyle,
      ref: attachFeedback,
      onClick: alertIfFeedbackUnavailable,
    },
  },
});
