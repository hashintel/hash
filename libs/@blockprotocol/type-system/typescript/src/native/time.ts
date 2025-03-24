import type { Timestamp } from "@blockprotocol/type-system";

export const generateTimestamp = (date: Date): Timestamp => {
  return date.toISOString() as Timestamp;
};

export const currentTimestamp = (): Timestamp => {
  return generateTimestamp(new Date());
};
