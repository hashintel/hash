import { LinkAndTargetEntity } from "../types";

export const sortLinkAndTargetEntities = <T extends LinkAndTargetEntity[]>(
  linkAndTargetEntities: T,
) => {
  return [...linkAndTargetEntities].sort((a, b) =>
    a.linkEntity.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
      b.linkEntity.metadata.temporalVersioning.decisionTime.start.limit,
    ),
  );
};
