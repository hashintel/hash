export const WIRE_ID_PREFIX = "wire__";
export const WIRE_ID_SEPARATOR = "::";

export type WireIdParts = {
  instanceId: string;
  externalPlaceId: string;
  internalPlaceId: string;
};

export const generateWireId = ({
  instanceId,
  externalPlaceId,
  internalPlaceId,
}: WireIdParts): string =>
  `${WIRE_ID_PREFIX}${encodeURIComponent(instanceId)}${WIRE_ID_SEPARATOR}${encodeURIComponent(externalPlaceId)}${WIRE_ID_SEPARATOR}${encodeURIComponent(internalPlaceId)}`;

export const parseWireId = (wireId: string): WireIdParts | null => {
  if (!wireId.startsWith(WIRE_ID_PREFIX)) {
    return null;
  }

  const rest = wireId.slice(WIRE_ID_PREFIX.length);
  const [instanceId, externalPlaceId, internalPlaceId] =
    rest.split(WIRE_ID_SEPARATOR);

  if (!instanceId || !externalPlaceId || !internalPlaceId) {
    return null;
  }

  return {
    instanceId: decodeURIComponent(instanceId),
    externalPlaceId: decodeURIComponent(externalPlaceId),
    internalPlaceId: decodeURIComponent(internalPlaceId),
  };
};
