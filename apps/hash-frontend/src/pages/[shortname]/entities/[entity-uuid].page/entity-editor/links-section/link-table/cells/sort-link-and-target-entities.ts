import { LinkAndTargetEntity } from "../types";

export const sortLinkAndTargetEntities = (
  linkAndTargetEntities: LinkAndTargetEntity[],
) => {
  return [...linkAndTargetEntities].sort((a, b) =>
    a.linkEntity.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
      b.linkEntity.metadata.temporalVersioning.decisionTime.start.limit,
    ),
  );
};
