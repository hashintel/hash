import { LinkAndTargetEntity } from "../types";

export const sortLinkAndTargetEntities = (
  linkAndTargetEntities: LinkAndTargetEntity[],
) => {
  return [...linkAndTargetEntities].sort((a, b) =>
    a.linkEntity.metadata.version.decisionTime.start.localeCompare(
      b.linkEntity.metadata.version.decisionTime.start,
    ),
  );
};
