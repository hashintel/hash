import { LinkEntity } from "@local/hash-graph-sdk/entity";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

import { LinkLabelWithSourceAndDestination } from "../../link-label-with-source-and-destination";
import { SectionWrapper } from "../../section-wrapper";
import { useEntityEditor } from "./entity-editor-context";

export const LinkSection: FunctionComponent = () => {
  const {
    linkAndDestinationEntitiesClosedMultiEntityTypesMap:
      closedMultiEntityTypesMap,
    closedMultiEntityTypesDefinitions,
    entity,
    entitySubgraph,
    onEntityClick,
  } = useEntityEditor();

  const linkEntity = useMemo(() => {
    return new LinkEntity(entity);
  }, [entity]);

  return (
    <SectionWrapper title="Link">
      <LinkLabelWithSourceAndDestination
        closedMultiEntityTypesMap={closedMultiEntityTypesMap}
        closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
        linkEntity={linkEntity}
        onEntityClick={onEntityClick}
        subgraph={entitySubgraph}
      />
    </SectionWrapper>
  );
};
