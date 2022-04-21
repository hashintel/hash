import { AirbyteMessage } from "./protocol";

/**
 * Takes the stdout of an Airbyte Connector and parses it into AirbyteMessages with the assumption that it's
 * JSON lines formatted.
 * @param json_lines - the stdout of the Airbyte Connector command
 * @returns - An Array of parsed AirbyteMessages (optimistically, type isn't verified)
 */
export const parse_message_stream = (
  json_lines: string,
): Array<AirbyteMessage> => {
  /** @todo: avoid splitting the whole thing in memory */
  return json_lines.split("\n").map((msg) => JSON.parse(msg));
};
