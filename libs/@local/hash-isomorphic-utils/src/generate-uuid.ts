import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

export const generateUuid = (): string => uuidv4();

/** The same UUID for the same name in the same namespace, which must itself be a UUID. */
export const generateUuidFromName = (name: string, namespace: string): string =>
  uuidv5(name, namespace);
