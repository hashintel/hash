import { frontendUrl } from "@local/hash-isomorphic-utils/environment";

export const getEntityTypeBaseUri = (entityTypeId: string, namespace: string) =>
  `${frontendUrl}/${namespace}/types/entity-type/${entityTypeId}/`;
