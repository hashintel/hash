import type { ViewportAction } from "@hashintel/petrinaut";
import * as Sentry from "@sentry/react";
import { MdBugReport } from "react-icons/md";

const feedbackButtonStyle: React.CSSProperties = {
  backgroundColor: "#8b5cf6dd",
  borderColor: "#7c3aed",
  color: "#fff",
};

const icon = <MdBugReport size={14} />;

export function useSentryFeedbackAction(): ViewportAction {
  // Wouldn't be optimized by React Compiler otherwise
  "use memo";

  return {
    key: "sentry-feedback",
    icon,
    label: "Give feedback",
    tooltip: "Give feedback",
    style: feedbackButtonStyle,
    ref: (node) => {
      const feedback = Sentry.getFeedback();

      if (!node || !feedback) {
        return;
      }

      // Attach feedback to the button and return the unsubscribe function
      return feedback.attachTo(node, {
        formTitle: "Give feedback",
        messagePlaceholder: "Report a bug or suggest an improvement",
        submitButtonLabel: "Submit feedback",
      });
    },
  };
}
