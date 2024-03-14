import { getRoots } from "@local/hash-subgraph/stdlib";
import type { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

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

    if (!rootEntity.linkData) {
      throw new Error("Link entity has no link data.");
    }

    return rootEntity as LinkEntity;
  }, [entitySubgraph]);

  return (
    <SectionWrapper title="Link">
      <LinkLabelWithSourceAndDestination
        linkEntity={linkEntity}
        subgraph={entitySubgraph}
      />
    </SectionWrapper>
  );
};
