import type { ViewportAction } from "@hashintel/petrinaut/ui";
import { css } from "@hashintel/ds-helpers/css";
import * as Sentry from "@sentry/react";
import { MdBugReport } from "react-icons/md";

const feedbackButtonStyle = css({
  backgroundColor: "[#8b5cf6dd !important]",
  borderColor: "[#7c3aed !important]",
  color: "[#fff !important]",
});

export function useSentryFeedbackAction(): ViewportAction {
  // Wouldn't be optimized by React Compiler otherwise
  "use memo";

  return {
    key: "sentry-feedback",
    icon: <MdBugReport size={14} />,
    label: "Give feedback",
    tooltip: "Give feedback",
    className: feedbackButtonStyle,
    ref: (node) => {
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
      } else {
        const showFeedbackUnavailable = () =>
          // eslint-disable-next-line no-alert -- intentional fallback when Sentry is not configured
          window.alert(
            "Sentry is not configured in this environment, so the feedback form is unavailable.",
          );

        node.addEventListener("click", showFeedbackUnavailable);
        return () => node.removeEventListener("click", showFeedbackUnavailable);
      }
    },
  };
}
