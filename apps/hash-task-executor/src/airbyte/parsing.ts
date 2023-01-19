import { AirbyteMessage } from "./protocol";

/**
 * Takes the stdout of an Airbyte Connector and parses it into AirbyteMessages with the assumption that it's
 * JSON lines formatted.
 * @param jsonLines - the stdout of the Airbyte Connector command
 * @returns - An Array of parsed AirbyteMessages (optimistically, type isn't verified)
 */
export const parseMessageStream = (
  jsonLines: string,
): Array<AirbyteMessage> => {
  /** @todo: avoid splitting the whole thing in memory */
  return jsonLines.split("\n").map((msg) => JSON.parse(msg) as AirbyteMessage);
};
