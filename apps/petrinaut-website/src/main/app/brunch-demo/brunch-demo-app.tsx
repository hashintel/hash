/**
 * @layerRoot website.brunch
 * @role Brunch Actual Mode demo: streams a live net from a Brunch endpoint
 */

import { useSharedSearchNavigation } from "../../../examples/use-shared-search-navigation";
import { useSentryFeedbackAction } from "../sentry-feedback-button";
import { BrunchActualModeRoute } from "./brunch-actual-mode-route";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type { BrunchRouteSearch } from "./brunch-search";

export const BrunchDemoApp = ({
  onSearchChange,
  search,
}: {
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: BrunchRouteSearch;
}) => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  const navigation = useSharedSearchNavigation(search, onSearchChange);

  return (
    <BrunchActualModeRoute
      navigation={navigation}
      search={search}
      viewportActions={[sentryFeedbackAction]}
    />
  );
};
