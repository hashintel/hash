import type { ColorElementType, Identity } from "./types/sdcpn";

/**
 * Whether a colour's key elements for `identity` — their types in element
 * order — are the identity's `keyElementTypes`. The cross-colour instance key
 * is the tuple of those element values, so a colour whose key types differ
 * would never correlate with the others.
 */
export const identityKeyTypesMatch = (
  keyTypes: readonly ColorElementType[],
  identity: Identity,
): boolean =>
  keyTypes.length === identity.keyElementTypes.length &&
  keyTypes.every(
    (keyType, index) => keyType === identity.keyElementTypes[index],
  );
