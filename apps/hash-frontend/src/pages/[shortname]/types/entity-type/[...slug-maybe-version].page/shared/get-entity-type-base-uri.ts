import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { BaseUri } from "@local/hash-subgraph";

export const getEntityTypeBaseUri = (
  entityTypeId: string,
  namespace: string,
): BaseUri =>
  `${frontendUrl}/${namespace}/types/entity-type/${entityTypeId}/` as BaseUri;
