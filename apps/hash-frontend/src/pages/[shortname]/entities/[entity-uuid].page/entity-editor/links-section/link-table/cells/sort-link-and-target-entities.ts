import type { LinkAndTargetEntity } from "../types";

export const sortLinkAndTargetEntities = <T extends LinkAndTargetEntity>(
  linkAndTargetEntities: T[],
): T[] => {
  return linkAndTargetEntities.toSorted((a, b) =>
    a.linkEntity.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
      b.linkEntity.metadata.temporalVersioning.decisionTime.start.limit,
    ),
  );
};
