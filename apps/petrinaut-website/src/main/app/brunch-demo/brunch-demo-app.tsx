/**
 * @layerRoot website.brunch
 * @role Brunch Actual Mode demo: streams a live net from a Brunch endpoint
 */

import { useSentryFeedbackAction } from "../sentry-feedback-button";
import { BrunchActualModeRoute } from "./brunch-actual-mode-route";

import type { BrunchRouteSearch } from "./brunch-search";

export const BrunchDemoApp = ({ search }: { search: BrunchRouteSearch }) => {
  const sentryFeedbackAction = useSentryFeedbackAction();

  return (
    <BrunchActualModeRoute
      search={search}
      viewportActions={[sentryFeedbackAction]}
    />
  );
};
