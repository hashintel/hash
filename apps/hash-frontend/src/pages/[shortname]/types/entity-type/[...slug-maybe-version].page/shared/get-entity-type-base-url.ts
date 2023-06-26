import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { BaseUrl } from "@local/hash-subgraph";

export const getEntityTypeBaseUrl = (
  entityTypeId: string,
  namespace: string,
): BaseUrl =>
  `${frontendUrl}/${namespace}/types/entity-type/${entityTypeId}/` as BaseUrl;
