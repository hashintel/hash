import type { FunctionComponent , useMemo } from "react";
import { LinkEntity } from "@local/hash-graph-sdk/entity";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { LinkLabelWithSourceAndDestination } from "../../../../shared/link-label-with-source-and-destination";
import { SectionWrapper } from "../../../shared/section-wrapper";

import { useEntityEditor } from "./entity-editor-context";

export const LinkSection: FunctionComponent = () => {
  const { entitySubgraph } = useEntityEditor();

  const linkEntity = useMemo(() => {
    const [rootEntity] = getRoots(entitySubgraph);

    if (!rootEntity) {
      throw new Error("No root entity found in entity editor subgraph.");
    }

    return new LinkEntity(rootEntity);
  }, [entitySubgraph]);

  return (
    <SectionWrapper title={"Link"}>
      <LinkLabelWithSourceAndDestination
        linkEntity={linkEntity}
        subgraph={entitySubgraph}
      />
    </SectionWrapper>
  );
};
