import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { FusionContext } from "./context";
import { fusionSubViews } from "./sub-views";

import type { Fusion } from "@hashintel/petrinaut-core";

export const FusionProperties: React.FC<{ fusion: Fusion }> = ({ fusion }) => (
  <FusionContext value={fusion}>
    <VerticalSubViewsContainer
      name="fusion-properties"
      subViews={fusionSubViews}
    />
  </FusionContext>
);
