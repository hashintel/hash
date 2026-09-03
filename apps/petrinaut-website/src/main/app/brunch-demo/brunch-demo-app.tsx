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
  // Petrinaut only mounts below once the Brunch stream is available, and the
  // stream is the whole point of this route, so the location starts in Actual
  // mode. Without this the controlled state would open in Edit mode and the
  // execution frame would read the local simulation instead of the stream.
  const navigation = useSharedSearchNavigation(search, onSearchChange, {
    initialState: { mode: "actual" },
  });

  return (
    <BrunchActualModeRoute
      navigation={navigation}
      search={search}
      viewportActions={[sentryFeedbackAction]}
    />
  );
};
