import { Entity } from "@hashintel/hash-subgraph";

export const sortLinkAndTargetEntities = (
  linkAndTargetEntities: {
    linkEntity: Entity;
    rightEntity: Entity;
  }[],
) => {
  return [...linkAndTargetEntities].sort((a, b) =>
    a.linkEntity.metadata.editionId.version.localeCompare(
      b.linkEntity.metadata.editionId.version,
    ),
  );
};
