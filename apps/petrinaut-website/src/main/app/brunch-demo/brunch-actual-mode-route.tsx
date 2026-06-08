import { BrunchActualModeProvider } from "./brunch-actual-mode-provider";
import { getBrunchEndpointFromLocation } from "./brunch-endpoint";
import { BrunchPetrinaut } from "./brunch-petrinaut";
import { BrunchStatusPage } from "./brunch-status-page";

import type { ViewportAction } from "@hashintel/petrinaut/ui";

export { BrunchActualModeProvider } from "./brunch-actual-mode-provider";
export { getBrunchEndpointFromLocation } from "./brunch-endpoint";

export const BrunchActualModeRoute = ({
  viewportActions,
}: {
  viewportActions: ViewportAction[];
}) => {
  const endpointResult = getBrunchEndpointFromLocation(window.location);

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
      <BrunchPetrinaut viewportActions={viewportActions} />
    </BrunchActualModeProvider>
  );
};
