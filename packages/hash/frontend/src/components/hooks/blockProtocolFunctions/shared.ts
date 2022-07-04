import {
  ApiEntityIdentifier,
  parseEntityIdentifier,
} from "../../../lib/entities";

/**
 * A utility for processing messages from blocks that target a specific entity:
 * 1. Check the 'data' key in the payload is provided
 * 2. Check that 'data' contains 'entityId'
 * 3. Parse the 'entityId' string to return our identifier object.
 *
 * We send blocks an 'entityId' that is a stringified object with multiple identifying fields –
 * this reverses the process so we can send the HASH API those multiple fields.
 *
 * @param messagePayload the object carried by the BP message
 * @returns {object} the 'data' object with 'entityId' rewritten and additional identifying fields added
 */
export const addIdentifiersToMessageData = <
  T extends {
    data?: { entityId: string; [key: string]: unknown } | undefined | null;
  },
>(
  messagePayload: T,
): T["data"] & ApiEntityIdentifier => {
  const { data } = messagePayload;
  if (!data) {
    throw new Error("'data' must be provided in message payload object");
  }

  if (!data.entityId) {
    throw new Error(
      `Expected 'entityId' in data object: ${JSON.stringify(data)}`,
    );
  }

  return { ...data, ...parseEntityIdentifier(data.entityId) };
};
