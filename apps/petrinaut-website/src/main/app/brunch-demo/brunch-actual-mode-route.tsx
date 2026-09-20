import { BrunchActualModeProvider } from "./brunch-actual-mode-provider";
import { getBrunchEndpoint } from "./brunch-endpoint";
import { BrunchPetrinaut } from "./brunch-petrinaut";
import { BrunchStatusPage } from "./brunch-status-page";

import type { BrunchRouteSearch } from "./brunch-search";
import type { PetrinautNavigationController } from "@hashintel/petrinaut/react";

export const BrunchActualModeRoute = ({
  navigation,
  search,
}: {
  navigation: PetrinautNavigationController;
  search: BrunchRouteSearch;
}) => {
  const endpointResult = getBrunchEndpoint({
    baseUrl: window.location.href,
    search,
  });

  if (!endpointResult.ok) {
    return (
      <BrunchStatusPage
        title="Missing Brunch endpoint"
        body={endpointResult.error}
      />
    );
  }

  return (
    <BrunchActualModeProvider
      endpoint={endpointResult.endpoint}
      key={`${endpointResult.endpoint}:${endpointResult.runId ?? ""}`}
      runId={endpointResult.runId}
    >
      <BrunchPetrinaut navigation={navigation} />
    </BrunchActualModeProvider>
  );
};
