import type { Timestamp } from "../generated/type-system.js";

export const generateTimestamp = (date: Date): Timestamp => {
  return date.toISOString() as Timestamp;
};

export const currentTimestamp = (): Timestamp => {
  return generateTimestamp(new Date());
};
