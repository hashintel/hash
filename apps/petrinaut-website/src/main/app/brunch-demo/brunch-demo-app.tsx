import { useSentryFeedbackAction } from "../sentry-feedback-button";

import { BrunchActualModeRoute } from "./brunch-actual-mode-route";

export const BrunchDemoApp = () => {
  const sentryFeedbackAction = useSentryFeedbackAction();

  return <BrunchActualModeRoute viewportActions={[sentryFeedbackAction]} />;
};
