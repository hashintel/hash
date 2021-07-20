import { Uuid4 } from "id128";

/** Generate a new entity ID. */
export const genEntityId = () => Uuid4.generate().toCanonical().toLowerCase();
