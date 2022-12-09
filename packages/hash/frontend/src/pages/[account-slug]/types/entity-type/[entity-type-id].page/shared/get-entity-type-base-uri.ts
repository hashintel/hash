import { frontendUrl } from "@hashintel/hash-shared/environment";

export const getEntityTypeBaseUri = (entityTypeId: string, namespace: string) =>
  `${frontendUrl}/${namespace}/types/entity-type/${entityTypeId}/`;
