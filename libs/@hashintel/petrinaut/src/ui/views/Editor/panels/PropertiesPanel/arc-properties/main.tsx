import { use } from "react";

import { CompositionContext } from "../../../../../../react/state/composition-context";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { arcPropertiesData } from "./arc-properties-data";
import { ArcPropertiesContext } from "./context";
import { arcSubViews } from "./sub-views";

import type { SDCPN } from "@hashintel/petrinaut-core";

interface ArcPropertiesProps {
  arcId: string;
  petriNetDefinition: SDCPN;
  fullSdcpn: SDCPN;
}

export const ArcProperties: React.FC<ArcPropertiesProps> = ({
  arcId,
  petriNetDefinition,
  fullSdcpn,
}) => {
  const { libraries } = use(CompositionContext);
  const data = arcPropertiesData(
    arcId,
    petriNetDefinition,
    fullSdcpn,
    libraries,
  );
  if (!data) {
    return null;
  }

  return (
    <ArcPropertiesContext value={data}>
      <VerticalSubViewsContainer name="arc-properties" subViews={arcSubViews} />
    </ArcPropertiesContext>
  );
};
