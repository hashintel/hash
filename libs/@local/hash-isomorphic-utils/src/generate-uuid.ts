import { v5 as uuidv5, v7 as uuidv7 } from "uuid";

export const generateUuid = () => uuidv7();

/** The same UUID for the same name in the same namespace, which must itself be a UUID. */
export const generateUuidFromName = (name: string, namespace: string) =>
  uuidv5(name, namespace);
